// Valuación relativa entre países: z-score de cocientes contra su propia historia.
// - P/E relativo: P/E_A / P/E_B mensual de worldperatio (el P/E de cada ETF de referencia). Mide valuación: si el cociente de precios cae
//   porque las ganancias de A cayeron más, el P/E relativo no baja.
// - Precio relativo: cociente de ETF MSCI con dividendos (ver pair.js). Mide desempeño relativo, no valuación.
// Ventanas: 3, 5 y 10 años. Calidad del P/E: misma regla que Valuación (≤10% de meses repetidos y ventana posterior al lanzamiento
// del ETF), aplicada a las dos series.
import { ETF_LAUNCH, STALE_MAX } from './sources/val.js';

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const stdev = (a, m = mean(a)) => Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));

/** Media, desvío, z y percentil del último valor de una serie [{d, v}] en los últimos `years` años. */
export function zStats(series, years) {
  if (!series?.length) return null;
  const lastD = series.at(-1).d;
  const from = `${Number(lastD.slice(0, 4)) - years}${lastD.slice(4)}`;
  const w = series.filter((p) => p.d >= from).map((p) => p.v);
  // Historia insuficiente para esa ventana (se toleran 45 días: Yahoo "10y" arranca unos días después del corte).
  if (w.length < 12 || Date.parse(series[0].d) - Date.parse(from) > 45 * 864e5) return null;
  const m = mean(w), sd = stdev(w, m), last = w.at(-1);
  return { years, n: w.length, mean: m, sd, last, z: (last - m) / sd, pctile: (w.filter((x) => x <= last).length / w.length) * 100, from };
}

/** Calidad de una serie mensual de worldperatio en una ventana (meses repetidos y lanzamiento del ETF). */
export function windowQuality(W, years) {
  const from = `${Number(W.date.slice(0, 4)) - years}${W.date.slice(4, 7)}`;
  const h = W.history.filter((p) => p.d.slice(0, 7) >= from);
  const rep = h.reduce((n, p, i) => n + (i && p.v === h[i - 1].v ? 1 : 0), 0);
  const stale = h.length > 1 ? rep / (h.length - 1) : 1;
  const launch = ETF_LAUNCH[W.etf];
  const preLaunch = launch ? from < launch : false;
  return { ok: stale <= STALE_MAX && !preLaunch, stale, preLaunch, launch: launch || null };
}

/** P/E relativo A/B (mensual) con z de 3 y 10 años, solo en ventanas con calidad en las dos series. */
export function relativePe(Wa, Wb) {
  const mb = new Map(Wb.history.map((p) => [p.d.slice(0, 7), p.v]));
  const series = Wa.history.filter((p) => mb.get(p.d.slice(0, 7)) > 0 && p.v > 0)
    .map((p) => ({ d: p.d.slice(0, 10), v: p.v / mb.get(p.d.slice(0, 7)) }));
  // El último punto mensual se reemplaza por el P/E diario más reciente de cada sitio (mismo criterio que la solapa Valuación).
  if (series.length && Wa.pe > 0 && Wb.pe > 0) series[series.length - 1] = { d: series.at(-1).d, v: Wa.pe / Wb.pe };
  const win = {};
  for (const y of [3, 10]) {
    const qa = windowQuality(Wa, y), qb = windowQuality(Wb, y);
    const st = zStats(series, y);
    win[`y${y}`] = st && { ...st, ok: qa.ok && qb.ok, quality: { a: qa, b: qb } };
  }
  return { series, last: series.at(-1)?.v ?? null, peA: Wa.pe, peB: Wb.pe, etfA: Wa.etf, etfB: Wb.etf, date: Wa.date, win };
}

/** Tendencia del cociente: regresión del logaritmo contra el tiempo (10 años). Con R² alto, la reversión a la media es dudosa. */
export function trendOf(series, years = 10) {
  const lastD = series.at(-1)?.d;
  if (!lastD) return null;
  const from = `${Number(lastD.slice(0, 4)) - years}${lastD.slice(4)}`;
  const w = series.filter((p) => p.d >= from && p.v > 0);
  if (w.length < 52) return null;
  const t0 = Date.parse(w[0].d);
  const xs = w.map((p) => (Date.parse(p.d) - t0) / (365.25 * 864e5)), ys = w.map((p) => Math.log(p.v));
  const mx = mean(xs), my = mean(ys);
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0), sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = sxy / sxx;
  const ssr = ys.reduce((s, y, i) => s + (y - (my + slope * (xs[i] - mx))) ** 2, 0), sst = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const r2 = sst ? 1 - ssr / sst : 0;
  const perYear = (Math.exp(slope) - 1) * 100;
  return { perYear, r2, years: Math.round((xs.at(-1)) * 10) / 10, trending: r2 >= 0.6 && Math.abs(perYear) >= 4 };
}
