// Par de países para Comparar: cociente entre los ETF MSCI de cada país (en USD, ajustados por dividendos = retorno total),
// en velas semanales, con media y desvíos de 5 años. Cálculo propio sobre precios de Yahoo.
// Velas: se arman con los cocientes diarios de cierre de cada semana (apertura = primer cierre de la semana, máximo y mínimo = el
// mayor y el menor cierre diario, cierre = último). No se usan máximos/mínimos intradiarios porque el cociente de dos máximos no es
// el máximo del cociente.
import { yahooSeries } from '../yahoo.js';

export const MSCI_ETF = {
  ar: 'ARGT', br: 'EWZ', us: 'EUSA', eu: 'EZU', mx: 'EWW', ca: 'EWC', co: 'COLO', cl: 'ECH', pe: 'EPU', jp: 'EWJ', in: 'INDA',
};

const weekKey = (d) => { // lunes de la semana (ISO), en UTC
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};

/** Cociente diario A/B (solo fechas con dato en ambos). */
export function ratioSeries(a, b) {
  const mb = new Map(b.map((p) => [p.d, p.v]));
  return a.filter((p) => mb.has(p.d) && mb.get(p.d) > 0).map((p) => ({ d: p.d, v: p.v / mb.get(p.d) }));
}

/** Velas semanales a partir de una serie diaria. */
export function weeklyCandles(s) {
  const out = [];
  for (const p of s) {
    const k = weekKey(p.d);
    const c = out.at(-1);
    if (!c || c.d !== k) out.push({ d: k, o: p.v, h: p.v, l: p.v, c: p.v, last: p.d });
    else Object.assign(c, { h: Math.max(c.h, p.v), l: Math.min(c.l, p.v), c: p.v, last: p.d });
  }
  return out;
}

/** Media, desvío, z-score y percentil del último cierre semanal, más momentum del cociente. */
export function ratioStats(candles) {
  const c = candles.map((x) => x.c);
  const n = c.length;
  if (n < 30) throw new Error('Historia insuficiente para el cociente (menos de 30 semanas)');
  const mean = c.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(c.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const last = c[n - 1];
  const ma26 = c.slice(-26).reduce((a, b) => a + b, 0) / Math.min(26, n);
  return {
    n, mean, sd, last, z: (last - mean) / sd, pctile: (c.filter((x) => x <= last).length / n) * 100,
    chg13: (last / c[n - 14] - 1) * 100, chg26: (last / c[n - 27] - 1) * 100, ma26, aboveMa26: last > ma26,
  };
}

export default async function pair(params = {}) {
  const a = String(params.a || '').toLowerCase(), b = String(params.b || '').toLowerCase();
  if (!MSCI_ETF[a] || !MSCI_ETF[b] || a === b) throw new Error(`Par inválido: usar a y b entre ${Object.keys(MSCI_ETF).join(', ')}`);
  const [sa, sb] = await Promise.all([yahooSeries(MSCI_ETF[a], '5y'), yahooSeries(MSCI_ETF[b], '5y')]);
  const ratio = ratioSeries(sa, sb);
  const candles = weeklyCandles(ratio);
  return {
    id: 'pair', a, b, tickers: { a: MSCI_ETF[a], b: MSCI_ETF[b] },
    candles: candles.map(({ d, o, h, l, c }) => ({ d, o, h, l, c })), stats: ratioStats(candles),
    from: ratio[0]?.d, to: ratio.at(-1)?.d,
    source: 'Yahoo Finance (precios ajustados por dividendos); cálculo propio', errors: [],
  };
}
