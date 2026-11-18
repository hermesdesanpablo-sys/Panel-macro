// Utilidades compartidas: HTTP, fechas, series y armado del payload.

const UA = 'Mozilla/5.0 (macro-dashboard; +https://vercel.com)';

export async function getJson(url, { headers = {}, timeout = 15000 } = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${new URL(url).host}`);
  return r.json();
}

export async function getText(url, { headers = {}, timeout = 15000 } = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${new URL(url).host}`);
  return r.text();
}

// ---------- fechas ----------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** '2027-11' -> 'nov-27' */
export const fmtMonthEs = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}`;
export const iso = (d) => d.toISOString().slice(0, 10);
export const today = () => iso(new Date());
export function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
export function daysAhead(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
/** 'dd/mm/yyyy' -> 'yyyy-mm-dd' */
export const dmyToIso = (s) => {
  const [d, m, y] = s.slice(0, 10).split('/');
  return `${y}-${m}-${d}`;
};
/** Date -> 'dd/mm/yyyy' */
export const toDmy = (d) => iso(d).split('-').reverse().join('/');

// ---------- series: siempre [{d:'yyyy-mm-dd', v:number}] ordenadas asc ----------
export function clean(series) {
  return series
    .filter((p) => p && p.d && Number.isFinite(p.v))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}
export const last = (s) => (s && s.length ? s[s.length - 1] : null);

/** Variación interanual de un índice mensual (yoy %). */
export function yoyFromIndex(series) {
  const byMonth = new Map(series.map((p) => [p.d.slice(0, 7), p.v]));
  const out = [];
  for (const p of series) {
    const [y, m] = p.d.slice(0, 7).split('-');
    const prev = byMonth.get(`${Number(y) - 1}-${m}`);
    if (prev) out.push({ d: p.d, v: (p.v / prev - 1) * 100 });
  }
  return out;
}

/** Valor al cierre de hace ~n días (el último punto con fecha <= target). */
export function valueAt(series, isoDate) {
  let res = null;
  for (const p of series) {
    if (p.d <= isoDate) res = p;
    else break;
  }
  return res;
}

/** Une varias series en filas {d, k1, k2...} para graficar. */
export function merge(seriesByKey) {
  const rows = new Map();
  for (const [k, s] of Object.entries(seriesByKey)) {
    for (const p of s || []) {
      if (!rows.has(p.d)) rows.set(p.d, { d: p.d });
      rows.get(p.d)[k] = p.v;
    }
  }
  return [...rows.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
}

/** Reduce series diarias largas a ~n puntos para no inflar el payload. */
export function thin(series, n = 260) {
  if (!series || series.length <= n) return series;
  const step = series.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(series[Math.floor(i * step)]);
  out[out.length - 1] = series[series.length - 1];
  return out;
}

// ---------- ejecución tolerante a fallas ----------
/**
 * Corre cada tarea en paralelo; si una falla, guarda el error y sigue.
 * tasks: { nombre: () => Promise }
 */
export async function settle(tasks, errors) {
  const keys = Object.keys(tasks);
  const res = await Promise.allSettled(keys.map((k) => tasks[k]()));
  const out = {};
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') out[keys[i]] = r.value;
    else {
      out[keys[i]] = null;
      errors.push({ source: keys[i], message: String(r.reason?.message || r.reason) });
    }
  });
  return out;
}

// Horizontes de la capa de dinámica.
export const HORIZONS = { m1: 30, m3: 91, m6: 182, m12: 365 };

/**
 * Variación de una serie a varios horizontes, medida desde su último dato.
 * unit 'pb': diferencia en puntos básicos (tasas, inflación). unit '%': variación porcentual (niveles).
 */
export function trend(series, unit = 'pb') {
  const p = last(series);
  if (!p) return null;
  const t0 = new Date(p.d).getTime();
  const out = {};
  for (const [h, days] of Object.entries(HORIZONS)) {
    const ref = valueAt(series, iso(new Date(t0 - days * 864e5)));
    // descartar si el dato de referencia está "viejo" (más de 45 días antes del horizonte buscado)
    const stale = ref && t0 - new Date(ref.d).getTime() > (days + 45) * 864e5;
    out[h] = !ref || stale || ref.d === p.d ? null : unit === 'pb' ? (p.v - ref.v) * 100 : (p.v / ref.v - 1) * 100;
  }
  return out;
}

/** Umbral para decir "sube/baja" a 3 meses (si no, "estable"). */
export function direction(tr, unit = 'pb') {
  const x = tr?.m3 ?? tr?.m1;
  if (x == null) return null;
  const th = unit === 'pb' ? 10 : 1;
  return x > th ? 'up' : x < -th ? 'down' : 'flat';
}

/** Mini-serie de ~13 meses para sparklines (máx. 60 puntos). */
export function sparkOf(series) {
  const p = last(series);
  if (!p) return [];
  const from = iso(new Date(new Date(p.d).getTime() - 400 * 864e5));
  return thin(series.filter((x) => x.d >= from), 60).map((x) => ({ d: x.d, v: x.v }));
}

/** KPI estándar. value null => se muestra "n/d". Incluye tendencia y sparkline. */
export function kpi({ key, label, series, unit = '%', decimals = 2, source, url, changeDays, changeUnit, note, group }) {
  series = series || [];
  const p = last(series);
  const cu = changeUnit || (unit === '%' ? 'pb' : '%');
  const out = { key, label, unit, decimals, source, url, note, group, value: p ? p.v : null, date: p ? p.d : null };
  if (p) {
    out.trend = trend(series, cu);
    out.trendUnit = cu;
    out.direction = direction(out.trend, cu);
    out.spark = sparkOf(series);
    // Variación contra la observación anterior (1 día en series diarias; 1 período en mensuales).
    const prev = series.length > 1 ? series[series.length - 2] : null;
    if (prev) {
      out.prevChange = cu === 'pb' ? (p.v - prev.v) * 100 : (p.v / prev.v - 1) * 100;
      out.prevDate = prev.d;
    }
  }
  if (p && changeDays) {
    const ref = valueAt(series, iso(new Date(new Date(p.d).getTime() - changeDays * 864e5)));
    if (ref && ref.d !== p.d) {
      out.change = cu === 'pb' ? (p.v - ref.v) * 100 : (p.v / ref.v - 1) * 100;
      out.changeUnit = cu;
      out.changeLabel = `${changeDays === 365 ? '1a' : changeDays === 30 ? '1m' : changeDays + 'd'}`;
    }
  }
  return out;
}

/** KPI derivado (spread entre dos series alineadas por fecha), p.ej. 2Y − tasa de política. */
export function spreadSeries(a, b) {
  const out = [];
  for (const p of a) {
    const q = valueAt(b, p.d);
    if (q) out.push({ d: p.d, v: p.v - q.v });
  }
  return out;
}

export function upcoming(events, limit = 12) {
  const t = today();
  return events
    .filter((e) => e.date >= t)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, limit);
}
