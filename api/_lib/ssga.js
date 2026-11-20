// State Street (SSGA), sin clave: planillas públicas de los SPDR.
//  - spdr-product-data-us-en.xlsx: una fila por ETF con NAV, cuotas, activos, P/E FY1 (forward), P/B, crecimiento esperado
//    del EPS a 3-5 años, dividend yield del índice, SEC 30 días, holdings y capitalización promedio (diario).
//  - navhist-us-en-<ticker>.xlsx: NAV, cuotas en circulación y activos diarios desde el lanzamiento (para los flujos).
import { readFirstSheet } from './xlsx.js';

const BASE = 'https://www.ssga.com/library-content/products/fund-data/etfs/us';
export const SSGA_PRODUCT = `${BASE}/spdr-product-data-us-en.xlsx`;
export const ssgaNavUrl = (t) => `${BASE}/navhist-us-en-${t.toLowerCase()}.xlsx`;

async function xlsx(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url.split('/').pop()}`);
  return readFirstSheet(Buffer.from(await r.arrayBuffer()));
}

const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
/** "Nov 18 2026" o "18-Nov-2026" → ISO. */
export function ssgaDate(s) {
  let m = String(s).match(/^([A-Z][a-z]{2}) (\d{1,2}) (\d{4})$/);
  if (m) return `${m[3]}-${MON[m[1]]}-${m[2].padStart(2, '0')}`;
  m = String(s).match(/^(\d{1,2})-([A-Z][a-z]{2})-(\d{4})$/);
  return m ? `${m[3]}-${MON[m[2]]}-${m[1].padStart(2, '0')}` : null;
}
/** "$91.21", "162.17 M", "2.42%", "$14,792.05 M", "-" → número (M = millones) o null. */
const num = (s) => {
  const t = String(s ?? '').replace(/[$,%]/g, '').trim();
  if (!t || t === '-') return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? (/ M$/.test(t) ? v * 1e6 : v) : null;
};

/** Planilla de productos → { TICKER: { asOf, nav, shares, aum, peFwd, pb, epsGrowth, divIndex, sec30, holdings, mktCap } }. */
export function parseProductData(rows) {
  const hi = rows.findIndex((r) => r[1] === 'Ticker');
  if (hi < 0) throw new Error('SSGA: planilla de productos sin encabezado "Ticker"');
  const H = rows[hi].map((h) => String(h).replace(/\s+/g, ' ').trim());
  const col = (name) => H.findIndex((h) => h === name);
  const C = {
    nav: col('NAV'), shares: col('Shares Outstanding'), aum: col('Total Net Assets'), sec30: col('30 Day SEC Yield'),
    divIndex: col('Index Dividend Yield'), epsGrowth: col('Est 3-5 Year EPS Growth'), holdings: col('Number of Holdings'),
    pb: col('Price/Book Ratio'), peFwd: col('Price/Earnings Ratio FY1'), mktCap: col('Weighted Average Market Cap'),
  };
  if (C.peFwd < 0 || C.pb < 0) throw new Error('SSGA: faltan columnas P/E FY1 o P/B (¿cambió la planilla?)');
  const out = {};
  for (const r of rows.slice(hi + 1)) {
    const t = String(r[1] || '').replace(/[®™]/g, '').trim();
    if (!/^[A-Z]{2,5}$/.test(t)) continue;
    out[t] = { asOf: ssgaDate(String(r[0]).trim()), name: String(r[2]).replace(/[®™]/g, ''), ...Object.fromEntries(Object.entries(C).map(([k, i]) => [k, i >= 0 ? num(r[i]) : null])) };
  }
  return out;
}

/** Histórico de NAV → [{ d, nav, so }] ascendente (las últimas `max` filas). */
export function parseNavHist(rows, max = 300) {
  const hi = rows.findIndex((r) => r[0] === 'Date' && r[2] === 'Shares Outstanding');
  if (hi < 0) throw new Error('SSGA: histórico de NAV sin encabezado');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const d = ssgaDate(String(r[0]).trim());
    const nav = parseFloat(r[1]), so = parseFloat(r[2]);
    if (d && Number.isFinite(nav) && Number.isFinite(so)) out.push({ d, nav, so });
    if (out.length >= max) break;
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : 1));
}

export const ssgaProducts = async () => parseProductData(await xlsx(SSGA_PRODUCT));
export const ssgaNavHist = async (t, max) => parseNavHist(await xlsx(ssgaNavUrl(t)), max);
