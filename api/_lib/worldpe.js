// worldperatio.com (gratis, sin clave): P/E diario por país calculado sobre un ETF de referencia, historia mensual desde
// 1995 y estadísticas por ventana (promedio μ y desvío σ excluyendo el 10% de valores extremos de cada lado).
// Lectura: dentro de μ ± σ "Fair"; > μ+σ "Overvalued"; > μ+2σ "Expensive"; < μ−σ "Undervalued"; < μ−2σ "Cheap".
import { getText, clean } from './util.js';

export const WPE_URL = (slug) => `https://worldperatio.com/${slug}`;

const MES = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };
const longDate = (s) => {
  const m = String(s).match(/(\d{1,2}) ([A-Z][a-z]+) (\d{4})/);
  return m && MES[m[2]] ? `${m[3]}-${MES[m[2]]}-${m[1].padStart(2, '0')}` : null;
};
const text = (html) => html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '|').replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s*\|[\s|]*/g, '|').replace(/\s+/g, ' ');

/** Página de un país → { pe, date, etf, history: [{d,v}] mensual, stats: { y1..y20: { avg, sd, z, label } } }. */
export function parseWorldPe(html) {
  const t = text(html);
  const cur = t.match(/current P\/E Ratio\|[^|]*\|P\/E Ratio\|([\d.]+)\|(\d{1,2} [A-Z][a-z]+ \d{4})/);
  if (!cur) throw new Error('worldperatio: no se encontró el P/E actual (¿cambió la página?)');
  const etf = t.match(/calculated on the\|([A-Z0-9.]+)\|/)?.[1] || null;
  const arr = html.match(/detailPE_data\s*=\s*(\[[\s\S]*?\]);/);
  const history = arr
    ? clean([...arr[1].matchAll(/Date\.UTC\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\),\s*(-?[\d.]+)\]/g)].map((m) => ({
        d: `${m[1]}-${String(Number(m[2]) + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`, v: parseFloat(m[4]),
      })))
    : [];
  // Tabla "Trailing P/E Ratio Stats": una fila <tr> por ventana con celdas μ, σ, rango, barra, desvío (en σ) y lectura.
  const stats = {};
  for (const m of html.matchAll(/<b>Last (\d+)Y<\/b>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, ' ').replace(/&sigma;|&#963;/g, 'σ').replace(/\s+/g, ' ').trim());
    const [avg, sd, , , z, label] = cells;
    if (Number.isFinite(parseFloat(avg))) stats[`y${m[1]}`] = { avg: parseFloat(avg), sd: parseFloat(sd), z: parseFloat(z), label: label || null };
  }
  return { pe: parseFloat(cur[1]), date: longDate(cur[2]), etf, history, stats };
}

export async function worldPe(slug) {
  return parseWorldPe(await getText(WPE_URL(slug), { timeout: 20000 }));
}
