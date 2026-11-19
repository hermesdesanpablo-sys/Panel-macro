// Crédito soberano en USD: bonos en dólares de cada emisor (onvista) vs curva del Tesoro de EE.UU. (FRED).
// La lista de ISINs la arma scripts/discover-usd-bonds.mjs (api/_lib/usd-bonds.json); acá solo se cotiza.
//
// Sobre las tasas: onvista calcula el rendimiento (método ISMA) con el último precio de las bolsas alemanas
// (Frankfurt/Stuttgart/Tradegate). Son precios indicativos y algunos bonos negocian poco: se marcan como "viejos"
// si el precio tiene más de PRICE_MAX_AGE días y quedan fuera de las curvas. Para bonos step-up (Argentina,
// Ecuador) el cálculo usa el cronograma de cupones de onvista; conviene contrastarlo con la fuente local.
import fs from 'node:fs';
import { getJson, iso, daysAgo, settle, last, valueAt } from '../util.js';
import { fred } from './us.js';

export const ISSUERS = [
  { id: 'ar', iso: 'AR', name: 'Argentina', prefixes: ['US040114'], names: ['Argentinien DL-Bonds'] },
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
      .filter(({ b, q }) => b.issuer === iss.id && q.ok)
      .map(({ b, q }) => {
        const v = q.v;
        const years = (Date.parse(b.maturity) - Date.parse(today)) / (365.25 * 864e5);
        const age = v.priceDate ? (Date.parse(today) - Date.parse(v.priceDate)) / 864e5 : 999;
        const ok = v.ytm != null && v.ytm > 0 && v.ytm < 60 && age <= PRICE_MAX_AGE && !v.inDefault;
        const u = interp(ust.map((p) => ({ x: p.x, v: p.v })), Math.min(years, 30));
        return {
          isin: b.isin, name: v.name || b.name, coupon: v.coupon ?? b.coupon, couponType: v.couponType, maturity: b.maturity,
          years: Math.round(years * 100) / 100, price: v.price, priceDate: v.priceDate, ytm: v.ytm, dur: v.dur,
          spread: ok && u != null ? Math.round((v.ytm - u) * 100) : null, stale: !ok, url: ovUrl(b.isin),
        };
      })
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
    issuers,
    ust: ust.map((p) => ({ years: p.x, v: p.v, id: p.id, d: p.d })),
    listUpdated: list.updated,
    source: 'onvista (precios de bolsas alemanas, rendimiento ISMA) · FRED (curva del Tesoro)',
    errors,
  };
}
