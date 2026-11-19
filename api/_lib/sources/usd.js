// Crédito soberano en USD: bonos en dólares de cada emisor (onvista) vs curva del Tesoro de EE.UU. (FRED).
// La lista de ISINs la arma scripts/discover-usd-bonds.mjs (api/_lib/usd-bonds.json); acá solo se cotiza.
//
// Sobre las tasas (todas en base SEMESTRAL, la convención del mercado de bonos en USD y de los Treasuries):
// - onvista trae el último precio de bolsas alemanas, pero para muchos bonos no publica el rendimiento, y cuando lo
//   publica usa ISMA (capitalización anual, ~+8 pb vs semestral).
// - Bonos bullet de cupón fijo: TIR propia desde el precio limpio (ytmBullet; validada contra onvista: misma TIR una vez
//   pasada a base semestral).
// - Amortizables / step-up (Argentina, Ecuador, algunos de Panamá y Uruguay): TIR de onvista (conoce el cronograma),
//   convertida de ISMA a semestral. Conviene contrastarla con la fuente local.
// - Precios de más de PRICE_MAX_AGE días o menores a 20 (default) quedan fuera de las curvas.
import fs from 'node:fs';
import { getJson, iso, daysAgo, settle, last, valueAt } from '../util.js';
import { fred } from './us.js';

export const ISSUERS = [
  // Argentina: solo los globales del canje 2020 (los anteriores son holdouts en default).
  { id: 'ar', iso: 'AR', name: 'Argentina', prefixes: ['US040114H'], names: ['Argentinien DL-Bonds 2020'], exclude: ['US040114AV28'] },
  { id: 'br', iso: 'BR', name: 'Brasil', prefixes: ['US105756'], names: ['Brasilien DL-Bonds'] },
  { id: 'cl', iso: 'CL', name: 'Chile', prefixes: ['US168863'], names: ['Chile DL-Bonds'] },
  { id: 'co', iso: 'CO', name: 'Colombia', prefixes: ['US195325'], names: ['Kolumbien DL-Bonds'] },
  { id: 'ec', iso: 'EC', name: 'Ecuador', prefixes: [], names: ['Ecuador DL-Bonds', 'Ecuador DL-Notes'] },
  { id: 'mx', iso: 'MX', name: 'México', prefixes: ['US91086Q'], names: ['Mexiko DL-Bonds', 'Mexiko DL-Notes'] },
  { id: 'pa', iso: 'PA', name: 'Panamá', prefixes: ['US698299'], names: ['Panama DL-Bonds'] },
  { id: 'pe', iso: 'PE', name: 'Perú', prefixes: ['US715638'], names: ['Peru DL-Bonds'] },
  { id: 'uy', iso: 'UY', name: 'Uruguay', prefixes: ['US760942'], names: ['Uruguay DL-Bonds'] },
];
const PRICE_MAX_AGE = 10; // días
/** ISMA (anual) → semestral (bond-equivalent). */
export const ismaToSemi = (y) => (y == null ? null : 200 * (Math.sqrt(1 + y / 100) - 1));
const OV = 'https://api.onvista.de/api/v1/bonds';
const ovUrl = (isin) => `https://www.onvista.de/anleihen/ISIN:${isin}`;

export async function ovSnapshot(isin) {
  return getJson(`${OV}/ISIN:${isin}/snapshot`, { headers: { 'User-Agent': 'Mozilla/5.0 (macro-dashboard)' }, timeout: 20000 });
}

/** Normaliza el snapshot de onvista: datos del bono y cifras (rendimiento, duration). */
export function parseBond(j) {
  const det = j.bondsDetails || {}, base = j.bondsBaseData || {}, fig = j.bondsFigures || {}, issuer = j.bondsIssuer || {};
  const d10 = (s) => (s ? String(s).slice(0, 10) : null);
  return {
    name: det.officialName || j.instrument?.name,
    currency: det.isoCurrency,
    coupon: det.coupon,
    couponType: det.nameTypeCoupon,
    maturity: d10(base.datetimeMaturity),
    perpetual: !!base.perpetual,
    inDefault: !!base.inDefault,
    country: issuer.isoCountry,
    issuerType: issuer.nameTypeIssuer,
    price: fig.priceForCalculation ?? j.quote?.last ?? null,
    priceDate: d10(fig.datetimePriceForCalculation || j.quote?.datetimeLast),
    ytm: Number.isFinite(fig.yieldToMaturity) ? fig.yieldToMaturity : null,
    dur: Number.isFinite(fig.modifyDuration) ? fig.modifyDuration : null,
  };
}

/** Bono que amortiza o tiene cupón escalonado: nombre con rango de años "(20/25-29)" o cupón no fijo. */
export const isAmortizing = (name = '', couponType = 'Fest') => /\d{2}-\d{2}\)/.test(name) || (couponType && couponType !== 'Fest');

/** Días entre fechas en base 30/360 (US). */
function d30(a, b) {
  const [y1, m1, x1] = [a.getUTCFullYear(), a.getUTCMonth() + 1, Math.min(a.getUTCDate(), 30)];
  const [y2, m2, x2] = [b.getUTCFullYear(), b.getUTCMonth() + 1, x1 === 30 ? Math.min(b.getUTCDate(), 30) : b.getUTCDate()];
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (x2 - x1);
}

/**
 * TIR (convención de mercado, semestral) de un bono bullet de cupón fijo, a partir del precio LIMPIO.
 * Precio sucio = Σ cupones y principal descontados a (1 + y/2)^(n − 1 + w), con w = fracción hasta el próximo cupón (30/360).
 * Se resuelve por bisección. Devuelve % anual o null.
 */
export function ytmBullet(clean, coupon, maturityIso, settleIso) {
  if (!(clean > 0) || coupon == null || !maturityIso) return null;
  const mat = new Date(maturityIso + 'T00:00:00Z'), st = new Date(settleIso + 'T00:00:00Z');
  if (mat <= st) return null;
  // Fechas de cupón hacia atrás desde el vencimiento, cada 6 meses.
  const dates = [];
  for (let k = 0; ; k++) {
    const d = new Date(Date.UTC(mat.getUTCFullYear(), mat.getUTCMonth() - 6 * k, mat.getUTCDate()));
    if (d <= st) { dates.push(d); break; }
    dates.push(d);
    if (k > 400) return null;
  }
  const prev = dates.pop(); // último cupón pagado (o inicio del período)
  const next = dates[dates.length - 1];
  const n = dates.length;
  const c = coupon / 2;
  const w = d30(st, next) / 180;
  const accrued = c * (1 - w);
  const dirty = clean + accrued;
  const pv = (y) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += (c + (k === n - 1 ? 100 : 0)) / Math.pow(1 + y / 200, k + w);
    return s;
  };
  let lo = -5, hi = 80;
  if ((pv(lo) - dirty) * (pv(hi) - dirty) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > dirty) lo = mid; else hi = mid;
  }
  void prev;
  return Math.round(((lo + hi) / 2) * 1e4) / 1e4;
}

/** Duration modificada (años) de un bono bullet semestral dado su TIR (%), con la misma grilla de cupones. */
export function modDurBullet(ytm, coupon, maturityIso, settleIso) {
  if (ytm == null || coupon == null) return null;
  const mat = new Date(maturityIso + 'T00:00:00Z'), st = new Date(settleIso + 'T00:00:00Z');
  const times = [];
  for (let k = 0; k < 400; k++) {
    const d = new Date(Date.UTC(mat.getUTCFullYear(), mat.getUTCMonth() - 6 * k, mat.getUTCDate()));
    if (d <= st) break;
    times.unshift((d - st) / (365.25 * 864e5));
  }
  if (!times.length) return null;
  const c = coupon / 2, y = ytm / 200;
  let pv = 0, tw = 0;
  times.forEach((t, k) => {
    const cf = c + (k === times.length - 1 ? 100 : 0);
    const df = Math.pow(1 + y, -2 * t);
    pv += cf * df;
    tw += t * cf * df;
  });
  return Math.round((tw / pv / (1 + y)) * 100) / 100;
}

/** Interpolación lineal en `x` sobre puntos [{x, v}] ordenados; sin extrapolar. */
export function interp(pts, x) {
  if (!pts.length || x < pts[0].x || x > pts[pts.length - 1].x) return null;
  const hi = pts.findIndex((p) => p.x >= x);
  if (pts[hi].x === x || hi === 0) return pts[hi].v;
  const a = pts[hi - 1], b = pts[hi];
  return a.v + ((b.v - a.v) * (x - a.x)) / (b.x - a.x);
}

const UST = [['DGS1MO', 1 / 12], ['DGS3MO', 0.25], ['DGS6MO', 0.5], ['DGS1', 1], ['DGS2', 2], ['DGS3', 3], ['DGS5', 5], ['DGS7', 7], ['DGS10', 10], ['DGS20', 20], ['DGS30', 30]];

async function ustCurve() {
  const ser = await Promise.all(UST.map(([id]) => fred(id, daysAgo(20)).catch(() => [])));
  const pts = UST.map(([id, x], i) => ({ id, x, v: last(ser[i])?.v, d: last(ser[i])?.d })).filter((p) => Number.isFinite(p.v));
  if (pts.length < 5) throw new Error('FRED: curva del Tesoro incompleta');
  return pts;
}

/** Corre funciones async con a lo sumo `n` en paralelo. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
    }
  }));
  return out;
}

function loadList() {
  return JSON.parse(fs.readFileSync(new URL('../usd-bonds.json', import.meta.url), 'utf8'));
}

export default async function usdCredit() {
  const errors = [];
  const list = loadList();
  const today = iso(new Date());
  const { ust } = await settle({ ust: ustCurve }, errors).then((d) => ({ ust: d.ust || [] }));
  const all = ISSUERS.flatMap((iss) => (list.issuers[iss.id] || []).filter((b) => b.maturity > today).map((b) => ({ ...b, issuer: iss.id })));
  const quotes = await pool(all, 8, (b) => ovSnapshot(b.isin).then(parseBond));
  const failed = quotes.filter((q) => !q.ok).length;
  if (failed) errors.push({ source: 'onvista', message: `${failed} de ${all.length} bonos sin cotización` });

  const issuers = ISSUERS.map((iss) => {
    const bonds = all
      .map((b, i) => ({ b, q: quotes[i] }))
      .filter(({ b, q }) => b.issuer === iss.id && q.ok && !(iss.exclude || []).includes(b.isin))
      .map(({ b, q }) => {
        const v = q.v;
        const coupon = v.coupon ?? b.coupon;
        const years = (Date.parse(b.maturity) - Date.parse(today)) / (365.25 * 864e5);
        const age = v.priceDate ? (Date.parse(today) - Date.parse(v.priceDate)) / 864e5 : 999;
        const amort = isAmortizing(v.name || b.name, v.couponType);
        const ytm = amort ? ismaToSemi(v.ytm) : ytmBullet(v.price, coupon, b.maturity, v.priceDate || today);
        // Sin cupón informado (p.ej. cupón cero/PDI de Ecuador): onvista no trae un rendimiento confiable → fuera de la curva.
        const ok = ytm != null && coupon != null && ytm > 0 && ytm < 60 && age <= PRICE_MAX_AGE && v.price >= 20 && !v.inDefault;
        const u = interp(ust.map((p) => ({ x: p.x, v: p.v })), Math.min(years, 30));
        return {
          isin: b.isin, name: v.name || b.name, coupon, couponType: v.couponType, amort, maturity: b.maturity,
          years: Math.round(years * 100) / 100, price: v.price, priceDate: v.priceDate, ytm: ytm == null ? null : Math.round(ytm * 1000) / 1000,
          ytmSrc: amort ? 'onvista (ISMA→semestral)' : 'cálculo propio',
          dur: amort ? v.dur : modDurBullet(ytm, coupon, b.maturity, v.priceDate || today) ?? v.dur,
          spread: ok && u != null ? Math.round((ytm - u) * 100) : null, stale: !ok, url: ovUrl(b.isin),
        };
      })
      // 144A / Reg S del mismo bono: uno por (vencimiento, cupón redondeado), el de precio más reciente.
      .sort((a, b) => (a.stale - b.stale) || ((b.priceDate || '') < (a.priceDate || '') ? -1 : 1))
      .filter((b, i, arr) => arr.findIndex((x) => x.maturity === b.maturity && Math.abs((x.coupon ?? -1) - (b.coupon ?? -1)) < 0.01) === i)
      .sort((a, b) => a.years - b.years);
    const live = bonds.filter((b) => !b.stale);
    const yc = live.map((b) => ({ x: b.years, v: b.ytm }));
    const sc = live.filter((b) => b.spread != null).map((b) => ({ x: b.years, v: b.spread }));
    const at = (pts, x) => { const r = interp(pts, x); return r == null ? null : Math.round(r * 100) / 100; };
    const mean = sc.length ? Math.round(sc.reduce((s, p) => s + p.v, 0) / sc.length) : null;
    return {
      id: iss.id, cc: iss.iso.toLowerCase(), name: iss.name, bonds,
      summary: { n: live.length, total: bonds.length, y5: at(yc, 5), y10: at(yc, 10), s5: at(sc, 5), s10: at(sc, 10), sMean: mean, maxYears: live.at(-1)?.years ?? null },
    };
  });

  return {
    id: 'usd',
    name: 'Crédito soberano en USD',
    flag: '💵',
    issuers,
    ust: ust.map((p) => ({ years: p.x, v: p.v, id: p.id, d: p.d })),
    listUpdated: list.updated,
    source: 'onvista (precios de bolsas alemanas, rendimiento ISMA) · FRED (curva del Tesoro)',
    errors,
  };
}
