// MSCI: factsheet mensual del índice país (PDF, sin clave). Sección "FUNDAMENTALS (<fecha>)": Div Yld (%), P/E, P/E Fwd y
// P/BV a fin de mes del índice país y de dos comparables (MSCI Emerging Markets o World, y MSCI ACWI o ACWI IMI).
// URL fija: siempre trae el último mes. México usa otro nombre de archivo.
import { extractText, getDocumentProxy } from 'unpdf';

export const MSCI_PDF = (slug) => `https://www.msci.com/documents/10199/255599/msci-${slug}.pdf`;
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

/** Texto del factsheet → { asOf, rows: [{ name, dy, pe, peFwd, pbv }] } (país primero, después los comparables). */
export function parseMsciText(text) {
  const f = text.match(/FUNDAMENTALS \(([A-Z]{3}) (\d{1,2}), (\d{4})\)\s*Div Yld \(%\) P\/E P\/E Fwd P\/BV\s*((?:[-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+\s*){1,3})/);
  if (!f) throw new Error('MSCI: factsheet sin sección FUNDAMENTALS (¿cambió el formato?)');
  const asOf = `${f[3]}-${MON[f[1]]}-${f[2].padStart(2, '0')}`;
  // Nombres de los índices: leyenda del gráfico de rendimiento acumulado (mismo orden que las filas).
  const leg = text.match(/CUMULATIVE INDEX PERFORMANCE[\s\S]*?\n((?:MSCI [^\n]+\n){1,3})/);
  const names = leg ? leg[1].trim().split('\n').map((s) => s.trim()) : [];
  const rows = f[4].trim().split(/\n/).map((l, i) => {
    const [dy, pe, peFwd, pbv] = l.trim().split(/\s+/).map(Number);
    return { name: names[i] || null, dy, pe, peFwd, pbv };
  });
  return { asOf, rows };
}

export async function msciFundamentals(slug) {
  const r = await fetch(MSCI_PDF(slug), { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en factsheet MSCI ${slug}`);
  const pdf = await getDocumentProxy(new Uint8Array(await r.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  return parseMsciText(text);
}
