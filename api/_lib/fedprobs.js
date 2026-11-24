// Probabilidades de decisión de la Fed por reunión, de dos fuentes:
// 1) Futuros de fed funds a 30 días (CBOT ZQ, vía Yahoo), con el método de CME FedWatch (cálculo propio).
// 2) Polymarket: mercados de predicción "Fed Decision in <mes>?" (API pública Gamma, sin clave).
import { getJson } from './util.js';

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1–12
const STEP = 0.25;

/**
 * Método FedWatch. strip: [{month:'AAAA-MM', implied}] (100 − precio ZQ = EFFR promedio esperado del mes).
 * meetings: fechas de decisión 'AAAA-MM-DD' (la nueva tasa rige desde el día siguiente).
 * effr: EFFR spot; lower/upper: rango vigente. Devuelve por reunión la tasa esperada y la distribución de rangos.
 */
export function fedWatch({ strip, meetings, effr, lower, upper, asOf }) {
  const imp = new Map(strip.map((c) => [c.month, c.implied]));
  const mm = meetings.filter((d) => d > asOf && imp.has(d.slice(0, 7)));
  const hasMeeting = (ym) => mm.some((d) => d.startsWith(ym));
  const nextYm = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
  const prevYm = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
  const out = [];
  let prevPost = effr;
  let dist = new Map([[lower, 1]]); // límite inferior del rango → probabilidad
  for (const date of mm) {
    const ym = date.slice(0, 7);
    const [y, m, day] = date.split('-').map(Number);
    const N = daysIn(y, m);
    const f = day / N; // fracción del mes con la tasa anterior
    // Tasa previa: el contrato del mes anterior si ese mes no tiene reunión (y no es el mes en curso); si no, la posterior de la reunión anterior.
    const pm = prevYm(ym);
    const pre = !out.length && pm < asOf.slice(0, 7) ? effr : imp.has(pm) && !hasMeeting(pm) && pm > asOf.slice(0, 7) ? imp.get(pm) : prevPost;
    // Tasa posterior: el contrato del mes siguiente si no tiene reunión (más estable con reuniones a fin de mes); si no, despeje del mes.
    const nm = nextYm(ym);
    const post = imp.has(nm) && !hasMeeting(nm) ? imp.get(nm) : (imp.get(ym) - pre * f) / (1 - f);
    const x = (post - pre) / STEP; // movimiento esperado en pasos de 25 pb
    const lo = Math.floor(x + 1e-9), pHi = x - lo;
    const nd = new Map();
    for (const [lb, p] of dist) {
      for (const [k, q] of [[lo, 1 - pHi], [lo + 1, pHi]]) {
        if (q < 1e-6) continue;
        const key = +(lb + k * STEP).toFixed(2);
        nd.set(key, (nd.get(key) || 0) + p * q);
      }
    }
    dist = nd;
    const ranges = [...dist].sort((a, b) => a[0] - b[0]).map(([lb, p]) => ({ lower: lb, upper: +(lb + STEP).toFixed(2), p }));
    const sum = (fn) => ranges.filter(fn).reduce((s, r) => s + r.p, 0);
    // Decisión de esa reunión (contra la reunión anterior): comparable con Polymarket.
    const moves = [[lo, 1 - pHi], [lo + 1, pHi]].filter(([, q]) => q > 1e-6).map(([k, q]) => ({ move: k * 25, p: q }));
    const pmv = (fn) => moves.filter(fn).reduce((a, b) => a + b.p, 0);
    out.push({
      date, pre: +pre.toFixed(4), post: +post.toFixed(4), moveBp: +((post - pre) * 100).toFixed(1),
      moves, cut: pmv((o) => o.move < 0), hold: pmv((o) => o.move === 0), hike: pmv((o) => o.move > 0),
      // Rango acumulado desde hoy (como la tabla de probabilidades de FedWatch).
      ranges, cumCut: sum((r) => r.lower < lower - 1e-9), cumHold: sum((r) => Math.abs(r.lower - lower) < 1e-9), cumHike: sum((r) => r.lower > lower + 1e-9),
    });
    prevPost = post;
  }
  return { asOf, current: { lower, upper, effr }, meetings: out };
}

const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const OUTCOME = [[/50\+? ?bps? decrease/i, -2], [/25 ?bps? decrease/i, -1], [/no change/i, 0], [/25 ?bps? increase/i, 1], [/50\+? ?bps? increase/i, 2]];

/** Polymarket: eventos "Fed Decision in <Mes>?" abiertos, asignados a la reunión del FOMC de ese mes. Precio = probabilidad del "Sí". */
export async function polymarketFed(meetings, asOf) {
  const evs = await getJson('https://gamma-api.polymarket.com/events?closed=false&limit=100&tag_slug=fed-rates', { timeout: 15000 });
  const out = [];
  for (const e of evs) {
    const mt = /^Fed Decision in (\w+)\?$/i.exec(e.title || '');
    if (!mt) continue;
    const mi = MONTHS_EN.indexOf(mt[1].toLowerCase());
    if (mi < 0) continue;
    const date = meetings.find((d) => d > asOf && Number(d.slice(5, 7)) === mi + 1); // la próxima reunión de ese mes
    if (!date) continue;
    const probs = {};
    for (const m of e.markets || []) {
      if (m.closed) continue;
      const o = OUTCOME.find(([re]) => re.test(m.groupItemTitle || m.question || ''));
      const yes = Number(JSON.parse(m.outcomePrices || '[]')[0]);
      if (o && Number.isFinite(yes)) probs[o[1]] = yes;
    }
    const tot = Object.values(probs).reduce((a, b) => a + b, 0);
    if (!tot) continue;
    const p = (k) => (probs[k] || 0) / tot; // se normaliza a 100% (los precios suman ~1 con el spread)
    out.push({
      date, title: e.title, url: `https://polymarket.com/event/${e.slug}`, volume: Number(e.volume) || 0, liquidity: Number(e.liquidity) || 0,
      outcomes: [-2, -1, 0, 1, 2].map((k) => ({ move: k * 25, p: p(k) })),
      cut: p(-2) + p(-1), hold: p(0), hike: p(1) + p(2),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
