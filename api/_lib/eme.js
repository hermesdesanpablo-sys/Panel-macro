// Colombia: Encuesta mensual de expectativas de analistas económicos (EME) del BanRep.
// El catálogo de encuestas de Suameca (consultaMenuXopcion?opcion=ENCUESTAS) lista los archivos de cada encuesta; de la EME se usa
// la "Serie histórica" (series_historicas.xlsx, ~2 MB, una fila por encuesta desde 2003, valores en decimal):
//   INFLACION_TOTAL           mensual, dic. año en curso, 12 meses, dic. año siguiente, 24 meses, 60 meses (promedio, desvío, mediana)
//   TRM                       fin de mes, fin de año, +12 meses, fin del siguiente año, +24 meses (pesos por dólar)
//   TASA DE INTERVENCION BR   tasa de política esperada en t, t+1 … t+24 meses (t = mes de la encuesta)
// Se usa la mediana. Si cambia el formato, parseEmeHistory falla con un error que nombra la hoja y la columna.
import { suamecaGet, suamecaFile } from './suameca.js';
import { readSheetsByName, excelDate } from './xlsx.js';
import { clean } from './util.js';

export const EME_PAGE = 'https://suameca.banrep.gov.co/estadisticas-economicas/encuestas';
const EME_HIST = 'https://suameca.banrep.gov.co/archivos/encuestas/encuesta_mensual_analistas_economicos/series_historicas.xlsx';
const SHEETS = { infl: 'INFLACION_TOTAL', trm: 'TRM', tpm: 'TASA DE INTERVENCION BR' };

/** URL de la serie histórica de la EME según el catálogo de encuestas (si el catálogo no responde, la URL conocida). */
export async function emeHistUrl() {
  try {
    const cat = await suamecaGet('consultaMenuXopcion?opcion=ENCUESTAS');
    const nodes = [];
    const walk = (n) => { nodes.push(n); (n.menuHijos || []).forEach(walk); };
    (Array.isArray(cat) ? cat : [cat]).forEach(walk);
    const eme = nodes.find((n) => /analistas econ[oó]micos \(EME\)/i.test(n.nombre || ''));
    return eme?.listaDocumento?.find((d) => /series_historicas\.xlsx$/i.test(d.nombreAdjunto || ''))?.nombreAdjunto || EME_HIST;
  } catch {
    return EME_HIST;
  }
}

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Hoja con encabezado de dos filas (grupo / estadística) → { [grupo normalizado]: { [estadística]: [{d, v}] } }. */
export function emeColumns(rows, sheet) {
  const h = rows.findIndex((r) => norm(r[0] || '') === 'FECHA ENCUESTA');
  if (h < 1) throw new Error(`EME ${sheet}: no encuentro la fila "FECHA ENCUESTA"`);
  const groups = rows[h - 1], stats = rows[h];
  const out = {};
  let g = '';
  for (let c = 1; c < stats.length; c++) {
    if (String(groups[c] || '').trim()) g = norm(groups[c]);
    const st = norm(stats[c] || '');
    if (!g || !st) continue;
    const series = [];
    for (const r of rows.slice(h + 1)) {
      const n = Number(r[0]), v = parseFloat(r[c]);
      if (n > 30000 && Number.isFinite(v)) series.push({ d: excelDate(n), v });
    }
    (out[g] ||= {})[st] = clean(series);
  }
  return out;
}

const col = (cols, sheet, re, stat = 'MEDIANA') => {
  const key = Object.keys(cols).find((k) => re.test(k));
  const s = key && cols[key][stat];
  if (!s?.length) throw new Error(`EME ${sheet}: falta la columna ${re} (${stat}). Hay: ${Object.keys(cols).join(' | ')}`);
  return s;
};
const pct = (s) => s.map((p) => ({ d: p.d, v: Math.round(p.v * 1e6) / 1e4 })); // decimal → %, 2 decimales significativos

/** Planilla histórica de la EME → medianas por horizonte (inflación y tasa en %, TRM en pesos). */
export function parseEmeHistory(buf) {
  const sh = readSheetsByName(buf, Object.values(SHEETS));
  const I = emeColumns(sh[SHEETS.infl], SHEETS.infl), T = emeColumns(sh[SHEETS.trm], SHEETS.trm), P = emeColumns(sh[SHEETS.tpm], SHEETS.tpm);
  const infl = {
    mom: pct(col(I, SHEETS.infl, /INFLACION MENSUAL/)),
    decCur: pct(col(I, SHEETS.infl, /DICIEMBRE PRESENTE/)),
    m12: pct(col(I, SHEETS.infl, /DOCE MESES/)),
    decNext: pct(col(I, SHEETS.infl, /DICIEMBRE DEL SIGUIENTE/)),
    m24: pct(col(I, SHEETS.infl, /VEINTICUATRO/)),
  };
  const trm = {
    eom: col(T, SHEETS.trm, /^FIN DE MES/),
    decCur: col(T, SHEETS.trm, /^FIN DE ANO/),
    m12: col(T, SHEETS.trm, /12 MESES/),
    decNext: col(T, SHEETS.trm, /SIGUIENTE ANO/),
    m24: col(T, SHEETS.trm, /24 MESES/),
  };
  // Tasa de política: columnas "t", "t+1 mes", "t+2 meses" … "t+24 meses".
  const tpm = [];
  for (const [k, v] of Object.entries(P)) {
    const m = k.match(/^T(?:\s*\+\s*(\d+)\s*MES(?:ES)?)?$/);
    if (m && v.MEDIANA?.length) tpm[Number(m[1] || 0)] = pct(v.MEDIANA);
  }
  if (!tpm[0] || !tpm[12]) throw new Error(`EME ${SHEETS.tpm}: faltan los horizontes t y t+12. Hay: ${Object.keys(P).join(' | ')}`);
  const asOf = infl.m12.at(-1).d;
  return { asOf, infl, trm, tpm };
}

// La EME sale una vez por mes: se guarda 6 h en memoria (la usan el panel y el calendario; la planilla pesa ~2 MB).
let memo = null;
export async function emeHistory() {
  if (memo && Date.now() - memo.t < 6 * 3600e3) return memo.p;
  const p = parseEmeHistory(await suamecaFile(await emeHistUrl(), { timeout: 40000 }));
  memo = { t: Date.now(), p };
  return p;
}
