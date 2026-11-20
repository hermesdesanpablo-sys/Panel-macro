// Valuación y flujos por país. Tres fuentes, cada una con lo que mejor cubre:
//  - worldperatio.com: P/E diario sobre el ETF de referencia, historia mensual desde 1995 y μ/σ por ventana (5/10/20 años).
//  - MSCI (factsheet mensual en PDF): P/E, P/E forward, P/BV y dividendo del índice país a fin de mes.
//  - iShares (BlackRock): P/E y P/B diarios del ETF y flujos = (cuotas_t − cuotas_t−1) × NAV_t, de la planilla del fondo.
// Argentina (ARGT) y Colombia (COLO) son de Global X, que responde 429 a consultas automáticas: sin flujos.
import { getJson, clean, iso, settle } from '../util.js';
import { worldPe, WPE_URL } from '../worldpe.js';
import { msciFundamentals, MSCI_PDF } from '../msci.js';
import { ssgaProducts, ssgaNavHist, SSGA_PRODUCT } from '../ssga.js';

const BLK = 'https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api';
const Q = 'appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares&locale=en_US&userType=individual';
const pageUrl = (pid) => `https://www.ishares.com/us/products/${pid}/`;

// Por país: ETF de iShares para flujos (pid = portfolioId del buscador de iShares), página de worldperatio y factsheet MSCI.
// worldperatio no tiene Eurozona: se usa Europa (VGK), y se avisa. EE.UU. en worldperatio = VTI (mercado total).
export const COUNTRIES = [
  { cid: 'ar', wpe: 'area/argentina', msci: 'argentina-index-net' },
  { cid: 'br', ticker: 'EWZ', pid: 239612, wpe: 'area/brazil', msci: 'brazil-index-net' },
  { cid: 'us', ticker: 'IVV', pid: 239726, wpe: 'area/united-states', msci: 'usa-index-net' },
  { cid: 'eu', ticker: 'EZU', pid: 239644, wpe: 'area/europe', wpeNote: 'P/E e historia de Europa (VGK): worldperatio no publica la Eurozona', msci: 'emu-index-net' },
  { cid: 'mx', ticker: 'EWW', pid: 239670, wpe: 'area/mexico', msci: 'mexico-index-usd-net' },
  { cid: 'ca', ticker: 'EWC', pid: 239615, wpe: 'area/canada', msci: 'canada-index-net' },
  { cid: 'co', wpe: 'area/colombia', msci: 'colombia-index-net' },
  { cid: 'cl', ticker: 'ECH', pid: 239618, wpe: 'area/chile', msci: 'chile-index-net' },
  { cid: 'pe', ticker: 'EPU', pid: 239606, wpe: 'area/peru', msci: 'peru-index-net' },
  { cid: 'jp', ticker: 'EWJ', pid: 239665, wpe: 'area/japan', msci: 'japan-index-net' },
  { cid: 'in', ticker: 'INDA', pid: 239659, wpe: 'area/india', msci: 'india-index-net' },
  // China: solo valuación y flujos (sin panel macro). worldperatio calcula su P/E sobre FXI (FTSE China 50), no sobre MCHI.
  { cid: 'cn', ticker: 'MCHI', pid: 239619, wpe: 'area/china', wpeNote: 'P/E e historia sobre FXI (FTSE China 50, solo grandes empresas)', msci: 'china-index-usd-net' },
  { cid: 'latam', ticker: 'ILF', pid: 239761, wpe: 'area/latin-america', agg: true },
  { cid: 'em', ticker: 'EEM', pid: 239637, wpe: 'area/emerging-markets', agg: true, msciFrom: ['brazil-index-net', 'MSCI Emerging Markets'] },
  { cid: 'world', ticker: 'ACWI', pid: 239600, agg: true, msciFrom: ['brazil-index-net', 'MSCI ACWI'] },
];
// Compatibilidad: los ETF con flujos.
export const FUNDS = COUNTRIES.filter((c) => c.pid);
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

// Sectores de EE.UU.: Select Sector SPDR (State Street, datos directos y diarios) + worldperatio (P/E e historia).
export const SECTORS = [
  { id: 'XLK', name: 'Tecnología', wpe: 'sector/sp-500-information-technology', slug: 'technology' },
  { id: 'XLC', name: 'Comunicaciones', wpe: 'sector/sp-500-communication-services', slug: 'communication-services' },
  { id: 'XLY', name: 'Consumo discrecional', wpe: 'sector/sp-500-consumer-discretionary', slug: 'consumer-discretionary' },
  { id: 'XLP', name: 'Consumo básico', wpe: 'sector/sp-500-consumer-staples', slug: 'consumer-staples' },
  { id: 'XLE', name: 'Energía', wpe: 'sector/sp-500-energy', slug: 'energy' },
  { id: 'XLF', name: 'Financiero', wpe: 'sector/sp-500-financials', slug: 'financial' },
  { id: 'XLV', name: 'Salud', wpe: 'sector/sp-500-health-care', slug: 'health-care' },
  { id: 'XLI', name: 'Industrial', wpe: 'sector/sp-500-industrials', slug: 'industrial' },
  { id: 'XLB', name: 'Materiales', wpe: 'sector/sp-500-materials', slug: 'materials' },
  { id: 'XLRE', name: 'Real estate', wpe: 'sector/sp-500-real-estate', slug: 'real-estate' },
  { id: 'XLU', name: 'Servicios públicos', wpe: 'sector/sp-500-utilities', slug: 'utilities' },
  { id: 'SPY', name: 'S&P 500', wpe: 'index/sp-500', agg: true },
];
const ssgaPage = (x) => `https://www.ssga.com/us/en/intermediary/etfs/${x.slug ? `state-street-${x.slug}-select-sector-spdr-etf` : 'state-street-spdr-sp-500-etf-trust'}-${x.id.toLowerCase()}`;

/** Bloque de sectores: misma estructura de filas que países (wpe, flujos) más los ratios de State Street. */
async function sectorsBlock(errors) {
  const tasks = { 'SSGA planilla de productos': ssgaProducts };
  for (const x of SECTORS) {
    tasks[`worldperatio ${x.id}`] = () => worldPe(x.wpe);
    tasks[`SSGA ${x.id} flujos`] = async () => computeFlows(await ssgaNavHist(x.id));
  }
  const d = await settle(tasks, errors);
  const P = d['SSGA planilla de productos'] || {};
  const rows = SECTORS.map((x) => {
    const W = d[`worldperatio ${x.id}`];
    return {
      cid: x.id, name: x.name, agg: !!x.agg, ticker: x.id, url: ssgaPage(x),
      ssga: P[x.id] || null,
      wpe: W && { pe: W.pe, date: W.date, etf: W.etf, stats: W.stats, quality: wpeQuality(W), url: WPE_URL(x.wpe), history: W.history.filter((p) => p.d >= HIST_FROM) },
      ...(d[`SSGA ${x.id} flujos`] || { flows: null, pct: null, cum: [] }),
    };
  });
  return { rows, ssgaAsOf: Object.values(P)[0]?.asOf || null, sources: { ssga: SSGA_PRODUCT } };
}

const HIST_FROM = '2006-01-01';

// Lanzamiento de cada ETF base de worldperatio (mes). Antes de esa fecha la serie es una reconstrucción que el sitio no documenta.
export const ETF_LAUNCH = {
  ARGT: '2011-03', EWZ: '2000-07', VTI: '2001-05', VGK: '2005-03', EWW: '1996-03', EWC: '1996-03', COLO: '2009-02', ECH: '2007-11',
  EPU: '2009-06', EWJ: '1996-03', INDA: '2012-02', FXI: '2004-10', FLLA: '2018-06', EEM: '2003-04', SPY: '1993-01',
  XLK: '1998-12', XLY: '1998-12', XLP: '1998-12', XLE: '1998-12', XLF: '1998-12', XLV: '1998-12', XLI: '1998-12', XLB: '1998-12', XLU: '1998-12',
  XLC: '2018-06', XLRE: '2015-10',
};
export const STALE_MAX = 0.1; // más de 10% de meses con el mismo valor que el mes anterior = dato viejo arrastrado

/**
 * Calidad de la serie mensual de worldperatio por ventana: % de meses repetidos y si la ventana arranca antes del ETF.
 * → { y5: { stale, preLaunch, ok }, y10: …, y20: … }
 */
export function wpeQuality(W) {
  const out = {};
  const launch = ETF_LAUNCH[W.etf];
  for (const [k, years] of [['y5', 5], ['y10', 10], ['y20', 20]]) {
    const from = `${Number(W.date.slice(0, 4)) - years}${W.date.slice(4, 7)}`;
    const h = W.history.filter((p) => p.d.slice(0, 7) >= from);
    const rep = h.reduce((n, p, i) => n + (i && p.v === h[i - 1].v ? 1 : 0), 0);
    const stale = h.length > 1 ? rep / (h.length - 1) : null;
    const preLaunch = launch ? from < launch : false;
    out[k] = { stale: stale == null ? null : Math.round(stale * 1000) / 1000, preLaunch, launch: launch || null, ok: stale != null && stale <= STALE_MAX && !preLaunch };
  }
  return out;
} // historia mensual para el gráfico: 20 años alcanzan para la ventana más larga

export default async function valuation() {
  const errors = [];
  const tasks = {};
  for (const c of COUNTRIES) {
    if (c.pid) {
      tasks[`iShares ${c.ticker} fundamentales`] = async () => parseFundamentals(await getJson(`${BLK}/v2/get-product-data?${Q}&portfolioId=${c.pid}&component=fundamentalsAndRisk`, { timeout: 20000 }));
      tasks[`iShares ${c.ticker} flujos`] = async () => computeFlows(await fundHistory(c.pid));
    }
    if (c.wpe) tasks[`worldperatio ${c.cid}`] = () => worldPe(c.wpe);
    if (c.msci) tasks[`MSCI ${c.msci}`] = () => msciFundamentals(c.msci);
  }
  const [d, sectors] = await Promise.all([settle(tasks, errors), sectorsBlock(errors)]);
  const msciRow = (c) => {
    if (c.msci) { const m = d[`MSCI ${c.msci}`]; return m && { asOf: m.asOf, name: m.rows[0]?.name, ...m.rows[0], url: MSCI_PDF(c.msci) }; }
    if (c.msciFrom) {
      const m = d[`MSCI ${c.msciFrom[0]}`];
      const r = m?.rows.find((x) => x.name === c.msciFrom[1]);
      return r && { asOf: m.asOf, ...r, url: MSCI_PDF(c.msciFrom[0]) };
    }
    return null;
  };
  const rows = COUNTRIES.map((c) => {
    const F = c.pid ? d[`iShares ${c.ticker} fundamentales`] || {} : {};
    const W = c.wpe ? d[`worldperatio ${c.cid}`] : null;
    return {
      cid: c.cid,
      agg: !!c.agg,
      ticker: c.ticker || null,
      url: c.pid ? pageUrl(c.pid) : null,
      // worldperatio: P/E diario, historia y estadísticas.
      wpe: W && {
        pe: W.pe, date: W.date, etf: W.etf, stats: W.stats, quality: wpeQuality(W), url: WPE_URL(c.wpe), note: c.wpeNote || null,
        history: W.history.filter((p) => p.d >= HIST_FROM),
      },
      msci: msciRow(c),
      // iShares: P/E y P/B del ETF y flujos.
      pe: F.priceEarnings?.v ?? null,
      pb: F.priceBook?.v ?? null,
      peAsOf: F.priceEarnings?.d ?? null,
      divYield: F.twelveMonTrlYld?.v ?? null,
      // Todos los ratios del ETF con su fecha (P/E y P/B diarios; rendimientos, beta y volatilidad a fin de mes).
      ishares: c.pid ? {
        pe: F.priceEarnings || null, pb: F.priceBook || null, div12m: F.twelveMonTrlYld || null, sec30: F.thirtyDaySecYield || null,
        beta3y: F.beta3Yr || null, vol3y: F.standardDeviation3Yr || null, holdings: F.numHoldings || null,
      } : null,
      ...(c.pid ? d[`iShares ${c.ticker} flujos`] || { flows: null, pct: null, cum: [] } : { flows: null, pct: null, cum: [] }),
    };
  });
  return {
    id: 'val',
    name: 'Valuación y flujos',
    funds: rows.filter((r) => r.ticker),
    rows,
    sectors,
    pending: PENDING,
    source: 'iShares y MSCI (países), State Street (sectores), worldperatio (historia del P/E, con control de calidad)',
    errors,
  };
}
