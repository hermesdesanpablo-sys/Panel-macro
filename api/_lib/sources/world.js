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
  { group: G.msci, ticker: 'ACWI', label: 'MSCI ACWI' },
  { group: G.msci, ticker: 'URTH', label: 'MSCI World' },
  { group: G.msci, ticker: 'EEM', label: 'MSCI Emerging Markets' },
  { group: G.msci, ticker: 'ILF', label: 'S&P Latin America 40' },
  { group: G.pais, ticker: 'EUSA', label: 'EE.UU. (EUSA)' },
  { group: G.pais, ticker: 'EZU', label: 'Eurozona (EZU)' },
  { group: G.pais, ticker: 'EWU', label: 'Reino Unido (EWU)' },
  { group: G.pais, ticker: 'EWJ', label: 'Japón (EWJ)' },
  { group: G.pais, ticker: 'MCHI', label: 'China (MCHI)' },
  { group: G.pais, ticker: 'INDA', label: 'India (INDA)' },
  { group: G.pais, ticker: 'EWC', label: 'Canadá (EWC)' },
  { group: G.pais, ticker: 'EWZ', label: 'Brasil (EWZ)' },
  { group: G.pais, ticker: 'EWW', label: 'México (EWW)' },
  { group: G.pais, ticker: 'ARGT', label: 'Argentina (ARGT)' },
  { group: G.pais, ticker: 'ECH', label: 'Chile (ECH)' },
  { group: G.pais, ticker: 'COLO', label: 'Colombia (COLO)' },
  { group: G.pais, ticker: 'EPU', label: 'Perú (EPU)' },
  { group: G.us, ticker: '^GSPC', label: 'S&P 500' },
  { group: G.us, ticker: '^IXIC', label: 'Nasdaq Composite' },
  { group: G.us, ticker: '^DJI', label: 'Dow Jones' },
  { group: G.us, ticker: '^RUT', label: 'Russell 2000' },
  { group: G.intl, ticker: '^STOXX50E', label: 'Euro Stoxx 50' },
  { group: G.intl, ticker: '^GDAXI', label: 'DAX' },
  { group: G.intl, ticker: '^FCHI', label: 'CAC 40' },
  { group: G.intl, ticker: '^FTSE', label: 'FTSE 100' },
  { group: G.intl, ticker: '^N225', label: 'Nikkei 225' },
  { group: G.intl, ticker: '^HSI', label: 'Hang Seng' },
  { group: G.intl, ticker: '000001.SS', label: 'Shanghai Composite' },
  { group: G.intl, ticker: '^KS11', label: 'KOSPI' },
  { group: G.intl, ticker: '^NSEI', label: 'Nifty 50' },
  { group: G.latam, ticker: '^BVSP', label: 'Ibovespa' },
  { group: G.latam, ticker: '^MXX', label: 'S&P/BMV IPC' },
  // Merval: Yahoo (^MERV) solo da el último valor, sin historia; Argentina queda cubierta por ARGT (MSCI).
  { group: G.latam, ticker: 'ICOLCAP.CL', label: 'COLCAP (ETF ICOLCAP)' },
  { group: G.latam, ticker: '^GSPTSE', label: 'S&P/TSX' },
  { group: G.riesgo, ticker: '^VIX', label: 'VIX' },
  { group: G.tasas, ticker: '^IRX', label: 'T-bill 13 sem.', unit: '%' },
  { group: G.tasas, ticker: '^FVX', label: 'UST 5Y', unit: '%' },
  { group: G.tasas, ticker: '^TNX', label: 'UST 10Y', unit: '%' },
  { group: G.tasas, ticker: '^TYX', label: 'UST 30Y', unit: '%' },
  { group: G.fx, ticker: 'DX-Y.NYB', label: 'DXY' },
  { group: G.fx, ticker: 'EURUSD=X', label: 'EUR/USD' },
  { group: G.fx, ticker: 'GBPUSD=X', label: 'GBP/USD' },
  { group: G.fx, ticker: 'JPY=X', label: 'USD/JPY' },
  { group: G.fx, ticker: 'CNY=X', label: 'USD/CNY' },
  { group: G.fx, ticker: 'CAD=X', label: 'USD/CAD' },
  { group: G.fx, ticker: 'BRL=X', label: 'USD/BRL' },
  { group: G.fx, ticker: 'MXN=X', label: 'USD/MXN' },
  { group: G.fx, ticker: 'COP=X', label: 'USD/COP' },
  { group: G.fx, ticker: 'CLP=X', label: 'USD/CLP' },
  { group: G.fx, ticker: 'ARS=X', label: 'USD/ARS' },
  { group: G.cmd, ticker: 'BZ=F', label: 'Brent' },
  { group: G.cmd, ticker: 'CL=F', label: 'WTI' },
  { group: G.cmd, ticker: 'GC=F', label: 'Oro' },
  { group: G.cmd, ticker: 'SI=F', label: 'Plata' },
  { group: G.cmd, ticker: 'HG=F', label: 'Cobre' },
  { group: G.cmd, ticker: 'ZS=F', label: 'Soja' },
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
