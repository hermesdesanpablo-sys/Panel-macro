// Valuación y flujos por país, con los ETF de iShares (BlackRock) como vehículo de referencia.
//  - P/E y P/B del ETF (diarios): API de datos de producto de BlackRock, componente "fundamentalsAndRisk".
//  - Flujos: planilla del fondo (SpreadsheetML), hoja "Historical" con NAV y cuotas en circulación diarias.
//    Flujo del día t = (cuotas_t − cuotas_t−1) × NAV_t (USD). Es la medida estándar de creaciones/rescates netos.
// Argentina (ARGT) y Colombia (COLO) son de Global X, que responde 429 a consultas automáticas: pendientes.
// P/E forward: lo publica MSCI en el factsheet mensual (PDF); pendiente de sumar el lector de PDF.
import { getJson, clean, iso, settle } from '../util.js';

const BLK = 'https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api';
const Q = 'appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares&locale=en_US&userType=individual';
const pageUrl = (pid) => `https://www.ishares.com/us/products/${pid}/`;

// Un ETF por país (iShares US). portfolioId del buscador de productos de iShares.
export const FUNDS = [
  { cid: 'br', ticker: 'EWZ', pid: 239612, name: 'iShares MSCI Brazil' },
  { cid: 'us', ticker: 'IVV', pid: 239726, name: 'iShares Core S&P 500' },
  { cid: 'eu', ticker: 'EZU', pid: 239644, name: 'iShares MSCI Eurozone' },
  { cid: 'mx', ticker: 'EWW', pid: 239670, name: 'iShares MSCI Mexico' },
  { cid: 'ca', ticker: 'EWC', pid: 239615, name: 'iShares MSCI Canada' },
  { cid: 'cl', ticker: 'ECH', pid: 239618, name: 'iShares MSCI Chile' },
  { cid: 'pe', ticker: 'EPU', pid: 239606, name: 'iShares MSCI Peru and Global Exposure' },
  { cid: 'jp', ticker: 'EWJ', pid: 239665, name: 'iShares MSCI Japan' },
  { cid: 'in', ticker: 'INDA', pid: 239659, name: 'iShares MSCI India' },
  { cid: 'latam', ticker: 'ILF', pid: 239761, name: 'iShares Latin America 40', agg: true },
  { cid: 'em', ticker: 'EEM', pid: 239637, name: 'iShares MSCI Emerging Markets', agg: true },
  { cid: 'world', ticker: 'ACWI', pid: 239600, name: 'iShares MSCI ACWI', agg: true },
];
export const PENDING = [
  { cid: 'ar', ticker: 'ARGT', name: 'Global X MSCI Argentina', note: 'Global X responde 429 a consultas automáticas' },
  { cid: 'co', ticker: 'COLO', name: 'Global X MSCI Colombia', note: 'Global X responde 429 a consultas automáticas' },
];

/** Recorre el JSON del componente y devuelve { nombre: { v, d } } de los campos con valor. */
export function parseFundamentals(j) {
  const out = {};
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    if (typeof o.name === 'string' && 'formattedValue' in o && typeof o.value === 'number') {
      const a = String(o.asOfDate || '');
      out[o.name] = { v: o.value, d: a.length === 8 ? `${a.slice(0, 4)}-${a.slice(4, 6)}-${a.slice(6)}` : null };
    }
    Object.values(o).forEach(walk);
  };
  walk(j);
  return out;
}

const MES = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const usDate = (s) => {
  const m = String(s).match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  return m ? `${m[3]}-${MES[m[1]]}-${m[2].padStart(2, '0')}` : null;
};

/**
 * Filas de la hoja "Historical" de la planilla SpreadsheetML: [{ d, nav, so }] ascendente.
 * La hoja viene de la más nueva a la más vieja; con `max` se corta (no hace falta la historia desde 2000).
 */
export function parseHistorical(xml, max = Infinity) {
  const i = xml.indexOf('ss:Name="Historical"');
  if (i < 0) throw new Error('iShares: planilla sin hoja Historical');
  const out = [];
  const re = /<ss:Row[^>]*>([\s\S]*?)<\/ss:Row>/g;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(xml)) && out.length < max) {
    const c = [...m[1].matchAll(/<ss:Data[^>]*>([\s\S]*?)<\/ss:Data>/g)].map((x) => x[1].trim());
    if (c[0] === 'As Of') continue;
    const d = usDate(c[0]);
    if (!d) { if (out.length) break; continue; } // fin de la hoja
    out.push({ d, nav: parseFloat(c[1]), so: parseFloat(String(c[3]).replace(/,/g, '')) });
  }
  return out.filter((r) => Number.isFinite(r.nav) && Number.isFinite(r.so)).reverse();
}

/** Baja la planilla en streaming y corta apenas tiene `rows` filas de la hoja Historical (~3 MB → ~0,5 MB). */
async function fundHistory(pid, rows = 300) {
  const url = `${BLK}/v1/get-fund-document?${Q}&portfolioId=${pid}&component=fundDownload`;
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en planilla iShares ${pid}`);
  if (!r.body?.getReader) return parseHistorical(await r.text(), rows);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let xml = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) xml += dec.decode(value, { stream: true });
    const h = xml.indexOf('ss:Name="Historical"');
    if (done || (h >= 0 && (xml.slice(h).match(/<\/ss:Row>/g) || []).length > rows + 2)) {
      if (!done) await reader.cancel().catch(() => {});
      break;
    }
  }
  return parseHistorical(xml, rows);
}

/** Flujos netos (USD) por ventana, en millones y en % de los activos, y flujo acumulado 12 meses. */
export function computeFlows(hist) {
  const s = clean(hist.map((r) => ({ d: r.d, v: r.so })));
  if (hist.length < 2) return null;
  const daily = [];
  for (let k = 1; k < hist.length; k++) daily.push({ d: hist[k].d, v: (hist[k].so - hist[k - 1].so) * hist[k].nav });
  const last = hist.at(-1);
  const aum = last.so * last.nav;
  const since = (days) => iso(new Date(Date.parse(last.d) - days * 864e5));
  const sum = (from) => daily.filter((x) => x.d > from).reduce((a, x) => a + x.v, 0);
  const win = { w1: since(7), m1: since(30), m3: since(91), ytd: `${Number(last.d.slice(0, 4)) - 1}-12-31`, y1: since(365) };
  const enough = (from) => hist[0].d <= from;
  const flows = Object.fromEntries(Object.entries(win).map(([k, from]) => [k, enough(from) ? sum(from) / 1e6 : null]));
  const pct = Object.fromEntries(Object.entries(flows).map(([k, v]) => [k, v == null ? null : (v * 1e6 / aum) * 100]));
  let acc = 0;
  const cum = daily.filter((x) => x.d > win.y1).map((x) => ({ d: x.d, v: (acc += x.v) / 1e6 }));
  return { asOf: last.d, aum: aum / 1e6, shares: s.at(-1)?.v, flows, pct, cum };
}

export default async function valuation() {
  const errors = [];
  const tasks = {};
  for (const f of FUNDS) {
    tasks[`iShares ${f.ticker} fundamentales`] = async () => parseFundamentals(await getJson(`${BLK}/v2/get-product-data?${Q}&portfolioId=${f.pid}&component=fundamentalsAndRisk`, { timeout: 20000 }));
    tasks[`iShares ${f.ticker} flujos`] = async () => computeFlows(await fundHistory(f.pid));
  }
  const d = await settle(tasks, errors);
  const funds = FUNDS.map((f) => {
    const F = d[`iShares ${f.ticker} fundamentales`] || {};
    return {
      ...f,
      url: pageUrl(f.pid),
      pe: F.priceEarnings?.v ?? null,
      pb: F.priceBook?.v ?? null,
      peAsOf: F.priceEarnings?.d ?? null,
      divYield: F.twelveMonTrlYld?.v ?? null,
      holdings: F.numHoldings?.v ?? null,
      ...(d[`iShares ${f.ticker} flujos`] || { flows: null, pct: null, cum: [] }),
    };
  });
  return {
    id: 'val',
    name: 'Valuación y flujos',
    funds,
    pending: PENDING,
    source: 'iShares (BlackRock): características del fondo y planilla diaria de NAV y cuotas en circulación',
    errors,
  };
}
