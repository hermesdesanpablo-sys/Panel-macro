// Par de países para Comparar: cociente entre los ETF MSCI de cada país (en USD, ajustados por dividendos = retorno total),
// en velas semanales, con media y desvíos de 5 años. Cálculo propio sobre precios de Yahoo.
// Velas: se arman con los cocientes diarios de cierre de cada semana (apertura = primer cierre de la semana, máximo y mínimo = el
// mayor y el menor cierre diario, cierre = último). No se usan máximos/mínimos intradiarios porque el cociente de dos máximos no es
// el máximo del cociente.
import { yahooSeries } from '../yahoo.js';
import { worldPe } from '../worldpe.js';
import { COUNTRIES as VAL_COUNTRIES } from './val.js';
import { zStats, relativePe, trendOf } from '../relval.js';
import { settle } from '../util.js';

const WPE_SLUG = Object.fromEntries(VAL_COUNTRIES.filter((c) => c.wpe).map((c) => [c.cid, c.wpe]));

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

/** Estadísticas del cociente de precios por ventana (3, 5 y 10 años, sobre cierres semanales) + momentum + tendencia. */
export function priceRatioBlock(candles) {
  const weekly = candles.map((c) => ({ d: c.d, v: c.c }));
  const win = Object.fromEntries([3, 5, 10].map((y) => [`y${y}`, zStats(weekly, y)]));
  return { win, stats: ratioStats(candles.slice(-262)), trend: trendOf(weekly, 10) };
}

export default async function pair(params = {}) {
  const a = String(params.a || '').toLowerCase(), b = String(params.b || '').toLowerCase();
  if (!MSCI_ETF[a] || !MSCI_ETF[b] || a === b) throw new Error(`Par inválido: usar a y b entre ${Object.keys(MSCI_ETF).join(', ')}`);
  const errors = [];
  const d = await settle({
    [`Yahoo ${MSCI_ETF[a]}`]: () => yahooSeries(MSCI_ETF[a], '10y'),
    [`Yahoo ${MSCI_ETF[b]}`]: () => yahooSeries(MSCI_ETF[b], '10y'),
    [`worldperatio ${a}`]: () => worldPe(WPE_SLUG[a]),
    [`worldperatio ${b}`]: () => worldPe(WPE_SLUG[b]),
  }, errors);
  const sa = d[`Yahoo ${MSCI_ETF[a]}`], sb = d[`Yahoo ${MSCI_ETF[b]}`];
  if (!sa || !sb) throw new Error(errors.map((e) => `${e.source}: ${e.message}`).join(' · ') || 'Sin precios');
  const ratio = ratioSeries(sa, sb);
  const candles = weeklyCandles(ratio);
  const wa = d[`worldperatio ${a}`], wb = d[`worldperatio ${b}`];
  return {
    id: 'pair', a, b, tickers: { a: MSCI_ETF[a], b: MSCI_ETF[b] },
    candles: candles.map(({ d: w, o, h, l, c }) => ({ d: w, o, h, l, c })), ...priceRatioBlock(candles),
    pe: wa && wb ? relativePe(wa, wb) : null,
    from: ratio[0]?.d, to: ratio.at(-1)?.d,
    source: 'Yahoo Finance (precios ajustados por dividendos) y worldperatio (P/E); cálculo propio', errors,
  };
}

/** Matriz de todos los pares: z del P/E relativo (10 años, o 3 si 10 no pasa la calidad) y del precio relativo (5 años). */
export async function pairs() {
  const ids = Object.keys(MSCI_ETF);
  const errors = [];
  const d = await settle(Object.fromEntries([
    ...ids.map((id) => [`Yahoo ${MSCI_ETF[id]}`, () => yahooSeries(MSCI_ETF[id], '10y')]),
    ...ids.filter((id) => WPE_SLUG[id]).map((id) => [`worldperatio ${id}`, () => worldPe(WPE_SLUG[id])]),
  ]), errors);
  const cells = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const sa = d[`Yahoo ${MSCI_ETF[a]}`], sb = d[`Yahoo ${MSCI_ETF[b]}`];
      const px = sa && sb ? zStats(weeklyCandles(ratioSeries(sa, sb)).map((c) => ({ d: c.d, v: c.c })), 5) : null;
      const wa = d[`worldperatio ${a}`], wb = d[`worldperatio ${b}`];
      const pe = wa && wb ? relativePe(wa, wb) : null;
      const peWin = pe && ([pe.win.y10, pe.win.y3].find((w) => w?.ok) || null);
      cells.push({ a, b, zPrice: px?.z ?? null, zPe: peWin?.z ?? null, peYears: peWin?.years ?? null, peRel: pe?.last ?? null });
    }
  }
  return { id: 'pairs', countries: ids, cells, source: 'Yahoo Finance (con dividendos) y worldperatio; cálculo propio', errors };
}
