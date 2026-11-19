// Mundo: proxies MSCI (ETFs en USD), índices locales, riesgo, tasas de EE.UU., monedas y commodities vía Yahoo.
import { settle } from '../util.js';
import { yahooSeries, perf } from '../yahoo.js';

const G = {
  msci: 'MSCI global (USD)',
  pais: 'MSCI por país (USD)',
  us: 'Índices EE.UU.',
  intl: 'Índices Europa y Asia',
  latam: 'Índices América y Canadá',
  riesgo: 'Riesgo',
  tasas: 'Tasas del Tesoro EE.UU.',
  fx: 'Monedas',
  cmd: 'Commodities',
};

// `unit` = '%' para tasas (las variaciones se muestran en pb). Tickers verificados en Yahoo el 18-nov-2026.
export const WORLD = [
  { group: G.msci, ticker: 'ACWI', label: 'MSCI ACWI', cc: 'world', code: 'ACWI' },
  { group: G.msci, ticker: 'URTH', label: 'MSCI World', cc: 'world', code: 'URTH' },
  { group: G.msci, ticker: 'EEM', label: 'MSCI Emerging Markets', cc: 'world', code: 'EEM' },
  { group: G.msci, ticker: 'ILF', label: 'S&P Latin America 40', cc: 'world', code: 'ILF' },
  { group: G.pais, ticker: 'EUSA', label: 'EE.UU. (EUSA)', cc: 'us', code: 'EUSA' },
  { group: G.pais, ticker: 'EZU', label: 'Eurozona (EZU)', cc: 'eu', code: 'EZU' },
  { group: G.pais, ticker: 'EWU', label: 'Reino Unido (EWU)', cc: 'gb', code: 'EWU' },
  { group: G.pais, ticker: 'EWJ', label: 'Japón (EWJ)', cc: 'jp', code: 'EWJ' },
  { group: G.pais, ticker: 'MCHI', label: 'China (MCHI)', cc: 'cn', code: 'MCHI' },
  { group: G.pais, ticker: 'INDA', label: 'India (INDA)', cc: 'in', code: 'INDA' },
  { group: G.pais, ticker: 'EWC', label: 'Canadá (EWC)', cc: 'ca', code: 'EWC' },
  { group: G.pais, ticker: 'EWZ', label: 'Brasil (EWZ)', cc: 'br', code: 'EWZ' },
  { group: G.pais, ticker: 'EWW', label: 'México (EWW)', cc: 'mx', code: 'EWW' },
  { group: G.pais, ticker: 'ARGT', label: 'Argentina (ARGT)', cc: 'ar', code: 'ARGT' },
  { group: G.pais, ticker: 'ECH', label: 'Chile (ECH)', cc: 'cl', code: 'ECH' },
  { group: G.pais, ticker: 'COLO', label: 'Colombia (COLO)', cc: 'co', code: 'COLO' },
  { group: G.pais, ticker: 'EPU', label: 'Perú (EPU)', cc: 'pe', code: 'EPU' },
  { group: G.us, ticker: '^GSPC', label: 'S&P 500', cc: 'us', code: 'SPX', featured: true },
  { group: G.us, ticker: '^IXIC', label: 'Nasdaq Composite', cc: 'us', code: 'IXIC', featured: true },
  { group: G.us, ticker: '^DJI', label: 'Dow Jones', cc: 'us', code: 'DJI', featured: true },
  { group: G.us, ticker: '^RUT', label: 'Russell 2000', cc: 'us', code: 'RUT' },
  { group: G.intl, ticker: '^STOXX50E', label: 'Euro Stoxx 50', cc: 'eu', code: 'SX5E', featured: true },
  { group: G.intl, ticker: '^GDAXI', label: 'DAX', cc: 'de', code: 'DAX', featured: true },
  { group: G.intl, ticker: '^FCHI', label: 'CAC 40', cc: 'fr', code: 'CAC' },
  { group: G.intl, ticker: '^FTSE', label: 'FTSE 100', cc: 'gb', code: 'UKX', featured: true },
  { group: G.intl, ticker: '^N225', label: 'Nikkei 225', cc: 'jp', code: 'NI225', featured: true },
  { group: G.intl, ticker: '^HSI', label: 'Hang Seng', cc: 'hk', code: 'HSI', featured: true },
  { group: G.intl, ticker: '000001.SS', label: 'Shanghai Composite', cc: 'cn', code: '000001', featured: true },
  { group: G.intl, ticker: '^KS11', label: 'KOSPI', cc: 'kr', code: 'KOSPI' },
  { group: G.intl, ticker: '^NSEI', label: 'Nifty 50', cc: 'in', code: 'NIFTY' },
  { group: G.latam, ticker: '^BVSP', label: 'Ibovespa', cc: 'br', code: 'IBOV', featured: true },
  { group: G.latam, ticker: '^MXX', label: 'S&P/BMV IPC', cc: 'mx', code: 'MEXBOL', featured: true },
  // Merval: Yahoo (^MERV) solo da el último valor, sin historia; Argentina queda cubierta por ARGT (MSCI).
  { group: G.latam, ticker: 'ICOLCAP.CL', label: 'COLCAP (ETF ICOLCAP)', cc: 'co', code: 'ICOLCAP' },
  { group: G.latam, ticker: '^GSPTSE', label: 'S&P/TSX', cc: 'ca', code: 'TSX', featured: true },
  { group: G.riesgo, ticker: '^VIX', label: 'VIX', cc: 'us', code: 'VIX' },
  { group: G.tasas, ticker: '^IRX', label: 'T-bill 13 sem.', unit: '%', cc: 'us', code: 'US3M' },
  { group: G.tasas, ticker: '^FVX', label: 'UST 5Y', unit: '%', cc: 'us', code: 'US05Y' },
  { group: G.tasas, ticker: '^TNX', label: 'UST 10Y', unit: '%', cc: 'us', code: 'US10Y' },
  { group: G.tasas, ticker: '^TYX', label: 'UST 30Y', unit: '%', cc: 'us', code: 'US30Y' },
  { group: G.fx, ticker: 'DX-Y.NYB', label: 'DXY', cc: 'us', code: 'DXY' },
  { group: G.fx, ticker: 'EURUSD=X', label: 'EURUSD', cc: 'eu', code: 'EURUSD' },
  { group: G.fx, ticker: 'GBPUSD=X', label: 'GBPUSD', cc: 'gb', code: 'GBPUSD' },
  { group: G.fx, ticker: 'JPY=X', label: 'USDJPY', cc: 'jp', code: 'USDJPY' },
  { group: G.fx, ticker: 'CNY=X', label: 'USDCNY', cc: 'cn', code: 'USDCNY' },
  { group: G.fx, ticker: 'CAD=X', label: 'USDCAD', cc: 'ca', code: 'USDCAD' },
  { group: G.fx, ticker: 'BRL=X', label: 'USDBRL', cc: 'br', code: 'USDBRL' },
  { group: G.fx, ticker: 'MXN=X', label: 'USDMXN', cc: 'mx', code: 'USDMXN' },
  { group: G.fx, ticker: 'COP=X', label: 'USDCOP', cc: 'co', code: 'USDCOP' },
  { group: G.fx, ticker: 'CLP=X', label: 'USDCLP', cc: 'cl', code: 'USDCLP' },
  { group: G.fx, ticker: 'ARS=X', label: 'USDARS', cc: 'ar', code: 'USDARS' },
  { group: G.cmd, ticker: 'BZ=F', label: 'Brent', cc: 'cmd', code: 'BRENT' },
  { group: G.cmd, ticker: 'CL=F', label: 'WTI', cc: 'cmd', code: 'WTI' },
  { group: G.cmd, ticker: 'GC=F', label: 'Oro', cc: 'cmd', code: 'GOLD' },
  { group: G.cmd, ticker: 'SI=F', label: 'Plata', cc: 'cmd', code: 'SILVER' },
  { group: G.cmd, ticker: 'HG=F', label: 'Cobre', cc: 'cmd', code: 'COPPER' },
  { group: G.cmd, ticker: 'ZS=F', label: 'Soja', cc: 'cmd', code: 'SOY' },
];

/** Corre `tasks` (objeto nombre → fn) con a lo sumo `n` en paralelo, para no gatillar el rate limit de Yahoo. */
function limitTasks(tasks, n = 8) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, res, rej } = queue.shift();
    fn().then(res, rej).finally(() => { active--; next(); });
  };
  return Object.fromEntries(Object.entries(tasks).map(([k, fn]) => [k, () => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); })]));
}

/** Base 100 al inicio común de las series (para comparar trayectorias en un solo eje). */
function rebase(seriesByKey) {
  const keys = Object.keys(seriesByKey).filter((k) => seriesByKey[k]?.length);
  if (!keys.length) return [];
  const start = keys.map((k) => seriesByKey[k][0].d).sort().at(-1);
  const maps = Object.fromEntries(keys.map((k) => [k, new Map(seriesByKey[k].map((p) => [p.d, p.v]))]));
  const base = Object.fromEntries(keys.map((k) => [k, seriesByKey[k].find((p) => p.d >= start)?.v]));
  const dates = [...new Set(keys.flatMap((k) => seriesByKey[k].map((p) => p.d)))].filter((d) => d >= start).sort();
  return dates.map((d) => Object.fromEntries([['d', d], ...keys.map((k) => [k, maps[k].has(d) ? (maps[k].get(d) / base[k]) * 100 : null])]));
}

export default async function world() {
  const errors = [];
  const tasks = limitTasks(Object.fromEntries(WORLD.map((w) => [`Yahoo ${w.ticker}`, () => yahooSeries(w.ticker)])));
  const d = await settle(tasks, errors);
  const rows = WORLD.map((w) => {
    const s = d[`Yahoo ${w.ticker}`];
    const p = s ? perf(s) : null;
    // Tasas: variación en pb (diferencia de niveles), no en %.
    if (p && w.unit === '%') {
      const at = (i) => s[i]?.v;
      p.d1 = s.length > 1 ? (p.last - at(s.length - 2)) * 100 : null;
      const ybase = s.find((x) => x.d.slice(0, 4) === p.date.slice(0, 4));
      const prevY = [...s].reverse().find((x) => x.d.slice(0, 4) < p.date.slice(0, 4));
      p.ytd = (prevY || ybase) ? (p.last - (prevY || ybase).v) * 100 : null;
      p.y1 = (p.last - s[0].v) * 100;
      p.chgUnit = 'pb';
    }
    // Variación absoluta del día (en la unidad del activo; para tasas, en puntos porcentuales).
    if (p && s.length > 1) p.d1abs = p.last - s[s.length - 2].v;
    return { ...w, perf: p, spark: s ? s.filter((_, i) => i % 3 === 0 || i === s.length - 1) : [] };
  });
  const S = (t) => d[`Yahoo ${t}`] || [];
  return {
    id: 'world',
    name: 'Mundo',
    flag: '🌐',
    markets: rows,
    charts: [
      { id: 'acwi', title: 'MSCI ACWI (USD)', unit: '', lines: [{ key: 'v', label: 'ACWI' }], data: S('ACWI').map((p) => ({ d: p.d, v: p.v })) },
      {
        id: 'regions',
        title: 'MSCI World vs Emergentes vs América Latina (base 100)',
        unit: '',
        lines: [{ key: 'w', label: 'World' }, { key: 'em', label: 'Emergentes' }, { key: 'la', label: 'América Latina' }],
        data: rebase({ w: S('URTH'), em: S('EEM'), la: S('ILF') }),
      },
    ],
    source: 'Yahoo Finance',
    errors,
  };
}
