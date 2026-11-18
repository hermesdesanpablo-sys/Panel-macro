// Mundo / líderes: proxies MSCI (ETFs iShares), riesgo, dólar, tasas y commodities vía Yahoo.
import { settle } from '../util.js';
import { yahooSeries, perf } from '../yahoo.js';

export const WORLD = [
  { group: 'Acciones (MSCI)', ticker: 'ACWI', label: 'MSCI ACWI (ACWI)' },
  { group: 'Acciones (MSCI)', ticker: 'URTH', label: 'MSCI World (URTH)' },
  { group: 'Acciones (MSCI)', ticker: 'EEM', label: 'MSCI Emerging Markets (EEM)' },
  { group: 'Acciones (MSCI)', ticker: 'ILF', label: 'S&P Latin America 40 (ILF)' },
  { group: 'Acciones (MSCI)', ticker: 'COLO', label: 'MSCI Colombia (COLO)' },
  { group: 'Acciones (local)', ticker: '^GSPC', label: 'S&P 500' },
  { group: 'Acciones (local)', ticker: '^STOXX50E', label: 'Euro Stoxx 50' },
  { group: 'Acciones (local)', ticker: '^N225', label: 'Nikkei 225' },
  { group: 'Riesgo', ticker: '^VIX', label: 'VIX', unit: 'pts' },
  { group: 'Tasas', ticker: '^TNX', label: 'UST 10Y (%)', unit: '%' },
  { group: 'Tasas', ticker: '^IRX', label: 'T-bill 13 sem. (%)', unit: '%' },
  { group: 'Monedas', ticker: 'DX-Y.NYB', label: 'DXY' },
  { group: 'Monedas', ticker: 'EURUSD=X', label: 'EUR/USD' },
  { group: 'Monedas', ticker: 'BRL=X', label: 'USD/BRL' },
  { group: 'Monedas', ticker: 'MXN=X', label: 'USD/MXN' },
  { group: 'Monedas', ticker: 'CAD=X', label: 'USD/CAD' },
  { group: 'Monedas', ticker: 'COP=X', label: 'USD/COP' },
  { group: 'Commodities', ticker: 'BZ=F', label: 'Brent' },
  { group: 'Commodities', ticker: 'GC=F', label: 'Oro' },
  { group: 'Commodities', ticker: 'HG=F', label: 'Cobre' },
  { group: 'Commodities', ticker: 'ZS=F', label: 'Soja' },
];

export default async function world() {
  const errors = [];
  const tasks = Object.fromEntries(WORLD.map((w) => [`Yahoo ${w.ticker}`, () => yahooSeries(w.ticker)]));
  const d = await settle(tasks, errors);
  const rows = WORLD.map((w) => {
    const s = d[`Yahoo ${w.ticker}`];
    return { ...w, perf: s ? perf(s) : null, spark: s ? s.filter((_, i) => i % 3 === 0 || i === s.length - 1) : [] };
  });
  const acwi = d['Yahoo ACWI'] || [];
  return {
    id: 'world',
    name: 'Mundo',
    flag: '🌐',
    markets: rows,
    charts: [
      { id: 'acwi', title: 'MSCI ACWI (ACWI, USD)', unit: '', lines: [{ key: 'v', label: 'ACWI' }], data: acwi.map((p) => ({ d: p.d, v: p.v })) },
    ],
    source: 'Yahoo Finance',
    errors,
  };
}
