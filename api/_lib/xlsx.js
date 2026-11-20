// Lector mínimo de .xlsx sin dependencias: descomprime el ZIP con zlib y lee la primera hoja como matriz de celdas.
// Alcanza para planillas "planas" (valores y textos compartidos); no evalúa fórmulas (usa el valor cacheado <v>).
import zlib from 'node:zlib';

/** Entradas del ZIP: { nombre: Buffer descomprimido }. Lee el directorio central (soporta stored y deflate). */
export function unzip(buf) {
  const out = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('xlsx: ZIP inválido');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('xlsx: directorio central inválido');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(local + 26), lelen = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize);
    out[name] = method === 0 ? data : zlib.inflateRawSync(data);
    p += 46 + nlen + elen + clen;
  }
  return out;
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIndex = (ref) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Primera hoja como array de filas (cada fila: array de valores string, '' si vacía). */
export const readFirstSheet = (buf) => readSheet(buf, 1);

/** Hoja número `n` (1 = primera, según el nombre de archivo sheetN.xml) como array de filas. */
export function readSheet(buf, n = 1) {
  const files = unzip(buf);
  const sharedXml = files['xl/sharedStrings.xml']?.toString('utf8') || '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, '')));
  const sheetName = n === 1
    ? Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0]
    : `xl/worksheets/sheet${n}.xml`;
  if (!sheetName || !files[sheetName]) throw new Error(`xlsx: no existe la hoja ${n}`);
  const xml = files[sheetName].toString('utf8');
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inner = ''] = cm;
      const v = inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? inner.match(/<t[^>]*>([^<]*)<\/t>/)?.[1] ?? '';
      row[colIndex(ref)] = /t="s"/.test(attrs) ? shared[Number(v)] ?? '' : decode(v);
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows;
}

/** Número de serie de Excel (base 1900) → 'aaaa-mm-dd'. */
export const excelDate = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(Number(n)) * 864e5).toISOString().slice(0, 10);
