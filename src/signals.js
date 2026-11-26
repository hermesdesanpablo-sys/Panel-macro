// Señales para Comparar (A vs B). Módulo sin JSX para poder testearlo en Node.
import { kpiByKey, fmtNum } from './format.js';

const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
/** Apreciación de la moneda local contra el USD en 3 meses (%, + = se aprecia). USDXXX sube = se deprecia; EURUSD y DXY al revés. */
const fxApprec3m = (p) => { const k = kpiByKey(p, 'fx'); const m3 = k?.trend?.m3; if (m3 == null) return null; return ['eu', 'us'].includes(p.id) ? m3 : -m3; };
/**
 * Señales A vs B (cada una de −1 a +1; + favorece a A). Regla propia, transparente:
 * - Valuación relativa: z del cociente A/B contra su media de 5 años (z −2 → +1: A barato frente a su historia con B).
 * - Momentum del cociente: variación de 13 semanas (±10% → ±1).
 * - Moneda: apreciación a 3 meses de A menos la de B (±5 pp → ±1).
 * - Inflación: baja de la inflación a/a en 3 meses, A menos B (±100 pb → ±1).
 * - Tasas: baja del bono ~2 años en 3 meses, A menos B (±75 pb → ±1); si falta, la tasa de política.
 */
export function pairSignals(A, B, pair) {
  const k = (p, key) => kpiByKey(p, key)?.trend?.m3;
  const f = [];
  if (pair?.stats) {
    const s = pair.stats;
    f.push({ key: 'val', label: 'Valuación relativa (cociente vs media 5 años)', w: 25, score: clamp(-s.z / 2), detail: `z = ${fmtNum(s.z, 2)} (percentil ${fmtNum(s.pctile, 0)} de 5 años)` });
    f.push({ key: 'mom', label: 'Momentum del cociente (13 semanas)', w: 20, score: clamp(s.chg13 / 10), detail: `${s.chg13 > 0 ? '+' : ''}${fmtNum(s.chg13, 1)}%; ${s.aboveMa26 ? 'sobre' : 'bajo'} su media de 26 semanas` });
  }
  const fa = fxApprec3m(A), fb = fxApprec3m(B);
  if (fa != null && fb != null) f.push({ key: 'fx', label: 'Moneda contra el USD (3 meses)', w: 20, score: clamp((fa - fb) / 5), detail: `${A.name} ${fa > 0 ? '+' : ''}${fmtNum(fa, 1)}% · ${B.name} ${fb > 0 ? '+' : ''}${fmtNum(fb, 1)}%` });
  const ia = k(A, 'cpi'), ib = k(B, 'cpi');
  if (ia != null && ib != null) f.push({ key: 'cpi', label: 'Tendencia de la inflación (3 meses)', w: 15, score: clamp((ib - ia) / 100), detail: `${A.name} ${ia > 0 ? '+' : ''}${fmtNum(ia, 0)} pb · ${B.name} ${ib > 0 ? '+' : ''}${fmtNum(ib, 0)} pb` });
  let ra = k(A, 'y2'), rb = k(B, 'y2'), rl = 'bono ~2 años';
  if (ra == null || rb == null) { ra = k(A, 'policy'); rb = k(B, 'policy'); rl = 'tasa de política'; }
  if (ra != null && rb != null) f.push({ key: 'rates', label: `Tendencia de tasas (${rl}, 3 meses)`, w: 20, score: clamp((rb - ra) / 75), detail: `${A.name} ${ra > 0 ? '+' : ''}${fmtNum(ra, 0)} pb · ${B.name} ${rb > 0 ? '+' : ''}${fmtNum(rb, 0)} pb` });
  const wsum = f.reduce((a, x) => a + x.w, 0);
  const total = wsum ? f.reduce((a, x) => a + x.w * x.score, 0) / wsum : 0;
  const agree = f.filter((x) => Math.sign(x.score) === Math.sign(total) && Math.abs(x.score) >= 0.15).length;
  const strong = Math.abs(total) >= 0.45 && agree >= Math.max(3, f.length - 1) && f.length >= 4;
  const fav = total > 0 ? A : B, other = total > 0 ? B : A;
  const verdict = strong ? { kind: 'strong', text: `Long ${fav.name} / short ${other.name}`, fav }
    : Math.abs(total) >= 0.2 ? { kind: 'tilt', text: `Sesgo a favor de ${fav.name}`, fav }
    : { kind: 'neutral', text: 'Sin ventaja clara', fav: null };
  // Lectura: valuación y momentum en sentido opuesto = el cociente está barato pero sigue cayendo (o caro y subiendo).
  const v = f.find((x) => x.key === 'val'), m = f.find((x) => x.key === 'mom');
  const conflict = v && m && Math.sign(v.score) !== Math.sign(m.score) && Math.abs(v.score) >= 0.3 && Math.abs(m.score) >= 0.3;
  return { factors: f, total, agree, verdict, conflict };
}

