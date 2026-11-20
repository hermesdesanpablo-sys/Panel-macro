// Ranking de emisores soberanos de América Latina (universo EMBI): puntaje por pilar contra los pares y comparación con el spread.
// Regla de datos: solo se usan datos con fecha 2025 o posterior; si un indicador no tiene dato reciente para un país, queda vacío
// (no se rellena con datos viejos) y el pilar se promedia con los indicadores que sí hay.
//
// Pilares y pesos (definidos con Hermes, 20-nov-2026): fiscal 25%, composición de la deuda 25%, externo 20%, institucional 15%,
// historial de pago 15%. Cada indicador se lleva a 0–100 contra el grupo (100 = el mejor del grupo, 0 = el peor) y el pilar es el
// promedio de sus indicadores. Si a un país le falta un pilar entero, el total se calcula con los pilares disponibles (re-ponderados)
// y se avisa.
import { getJson, settle } from '../util.js';
import { parseWeo, WEO_URL } from './sust.js';
import { debtComposition, QPSD_URL } from '../debtcomp.js';
import { ecuadorDebt, EC_DEBT_PAGE } from '../ecdebt.js';
import { embi, EMBI_PAGE } from './usd.js';
import { readSheet } from '../xlsx.js';

export const UNIVERSE = [
  { id: 'ar', name: 'Argentina', iso3: 'ARG', boc: 'Argentina' },
  { id: 'br', name: 'Brasil', iso3: 'BRA', boc: 'Brazil' },
  { id: 'cl', name: 'Chile', iso3: 'CHL', boc: 'Chile' },
  { id: 'co', name: 'Colombia', iso3: 'COL', boc: 'Colombia' },
  { id: 'mx', name: 'México', iso3: 'MEX', boc: 'Mexico' },
  { id: 'pe', name: 'Perú', iso3: 'PER', boc: 'Peru' },
  { id: 'uy', name: 'Uruguay', iso3: 'URY', boc: 'Uruguay' },
  { id: 'ec', name: 'Ecuador', iso3: 'ECU', boc: 'Ecuador' },
];
export const PILLARS = [
  { key: 'fiscal', label: 'Fiscal', weight: 25 },
  { key: 'comp', label: 'Composición de la deuda', weight: 25 },
  { key: 'ext', label: 'Externo', weight: 20 },
  { key: 'inst', label: 'Institucional', weight: 15 },
  { key: 'hist', label: 'Historial de pago', weight: 15 },
];
export const MIN_YEAR = 2025;
const BOC_URL = 'https://www.bankofcanada.ca/wp-content/uploads/2026/10/BoC-BoE-Database-2026.xlsx';
const BOC_PAGE = 'https://www.bankofcanada.ca/2026/10/staff-analytical-paper-2026-48/';
const WGI_URL = 'https://www.worldbank.org/en/publication/worldwide-governance-indicators';
export const DEFAULT_MIN_USD_M = 1000; // monto mínimo en default (USD millones) para contar un año como default material
export const HIST_CAP = 30; // años sin default que dan el puntaje máximo

// Indicadores: pilar, si "más es mejor", unidad y cómo se describe.
export const INDICATORS = [
  { key: 'debt', pillar: 'fiscal', better: 'low', label: 'Deuda bruta del gobierno', unit: '% PBI', src: 'FMI WEO, 2025' },
  { key: 'intRev', pillar: 'fiscal', better: 'low', label: 'Intereses / ingresos del gobierno', unit: '%', src: 'FMI WEO, 2025 (cálculo propio)' },
  { key: 'fb', pillar: 'fiscal', better: 'high', label: 'Resultado fiscal', unit: '% PBI', src: 'FMI WEO, 2025' },
  { key: 'fxShare', pillar: 'comp', better: 'low', label: 'Deuda en moneda extranjera', unit: '% del total', src: 'Banco Mundial QPSD' },
  { key: 'extShare', pillar: 'comp', better: 'low', label: 'Deuda con acreedores externos', unit: '% del total', src: 'Banco Mundial QPSD' },
  { key: 'due12m', pillar: 'comp', better: 'low', label: 'Vencimientos a 12 meses', unit: '% PBI', src: 'Banco Mundial QPSD' },
  { key: 'ca', pillar: 'ext', better: 'high', label: 'Cuenta corriente', unit: '% PBI', src: 'FMI WEO, 2025' },
  { key: 'resGdp', pillar: 'ext', better: 'high', label: 'Reservas internacionales', unit: '% PBI', src: 'Banco Mundial (reservas 2025) / FMI (PBI en USD)' },
  { key: 'fxDebtRes', pillar: 'ext', better: 'low', label: 'Deuda pública en moneda extranjera / reservas', unit: 'veces', src: 'QPSD + Banco Mundial (cálculo propio)' },
  { key: 'wgi', pillar: 'inst', better: 'high', label: 'Gobernanza (promedio de los 6 indicadores WGI)', unit: '−2,5 a 2,5', src: 'Banco Mundial WGI, 2025' },
  { key: 'yearsNoDefault', pillar: 'hist', better: 'high', label: `Años sin default comercial material (tope ${HIST_CAP})`, unit: 'años', src: 'BoC-BoE Sovereign Default Database 2026' },
];

// ---------- fuentes ----------
async function weo2025() {
  const codes = UNIVERSE.map((c) => c.iso3).join('+');
  const j = await getJson(`https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/+/${codes}.GGXWDG_NGDP+GGR_NGDP+GGXCNL_NGDP+GGXONLB_NGDP+BCA_NGDPD+NGDPD.A?startPeriod=${MIN_YEAR}`, { timeout: 30000 });
  return parseWeo(j);
}
async function wbLatest(indicator, source) {
  const j = await getJson(`https://api.worldbank.org/v2/country/${UNIVERSE.map((c) => c.iso3).join(';')}/indicator/${indicator}?format=json&mrnev=1&per_page=100${source ? `&source=${source}` : ''}`, { timeout: 30000 });
  const out = {};
  for (const x of j?.[1] || []) if (x.value != null) out[x.countryiso3code] = { v: x.value, y: Number(String(x.date).slice(0, 4)) };
  return out;
}
async function wgi() {
  const keys = ['GE', 'RL', 'CC', 'RQ', 'PV', 'VA'];
  const res = {};
  for (const k of keys) res[k] = await wbLatest(`GOV_WGI_${k}.EST`, 3); // secuencial: la API corta con muchas consultas a la vez
  return res;
}

/**
 * Base de defaults del Banco de Canadá y el Banco de Inglaterra, hoja "Debt_2026.csv": monto en default (USD M) por país, año y acreedor.
 * Se cuenta solo deuda comercial (bonos y préstamos en moneda extranjera, deuda en moneda local y otros acreedores privados): los atrasos
 * con acreedores oficiales incluyen casos que no son defaults de mercado. → { país: { lastYear, lastAmount, dataTo } }
 */
export function parseDefaults(rows) {
  const hi = rows.findIndex((r) => r[2] === 'DEBT_COUNTRY' && r[4] === 'DEBT_YEAR');
  if (hi < 0) throw new Error('BoC-BoE: no se encontró el encabezado DEBT_COUNTRY / DEBT_YEAR (¿cambió la planilla?)');
  const H = rows[hi];
  const col = (re) => H.findIndex((h) => re.test(h));
  const C = [/^DEBT_FC_BONDS_/, /^DEBT_FC_BANK_LOANS_/, /^DEBT_LC_DEBT_/, /^DEBT_PRIVATE_CREDITORS_/].map(col);
  if (C.some((i) => i < 0)) throw new Error('BoC-BoE: faltan columnas de deuda comercial');
  const out = {};
  for (const r of rows.slice(hi + 1)) {
    const name = r[2], y = Number(r[4]);
    if (!name || !Number.isFinite(y)) continue;
    const amt = C.reduce((s, i) => s + (Number(r[i]) || 0), 0);
    const o = (out[name] ??= { lastYear: null, lastAmount: 0, dataTo: 0 });
    o.dataTo = Math.max(o.dataTo, y);
    if (amt >= DEFAULT_MIN_USD_M && (o.lastYear == null || y > o.lastYear)) { o.lastYear = y; o.lastAmount = amt; }
  }
  return out;
}
async function defaults() {
  const r = await fetch(BOC_URL, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en la base de defaults del Banco de Canadá`);
  return parseDefaults(readSheet(Buffer.from(await r.arrayBuffer()), 2));
}

// ---------- cálculo ----------
/** Puntaje 0–100 contra el grupo (min–max). Con menos de 3 países con dato, no se puntúa (no hay contra quién comparar). */
export function scoreIndicator(values, better) {
  const xs = Object.values(values).filter(Number.isFinite);
  if (xs.length < 3) return {};
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const out = {};
  for (const [id, v] of Object.entries(values)) {
    if (!Number.isFinite(v)) continue;
    const s = hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100;
    out[id] = better === 'high' ? s : 100 - s;
  }
  return out;
}

/** Ajuste log-lineal del spread contra el puntaje: spread que "justifican" los fundamentos y residuo (pb). */
export function fitSpreads(points) {
  const P = points.filter((p) => Number.isFinite(p.score) && p.spread > 0);
  if (P.length < 5) return null;
  const n = P.length, xs = P.map((p) => p.score), ys = P.map((p) => Math.log(p.spread));
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (!sxx) return null;
  const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx, a = my - b * mx;
  const fitted = Object.fromEntries(P.map((p) => [p.id, Math.exp(a + b * p.score)]));
  const ssr = P.reduce((s, p, i) => s + (ys[i] - (a + b * p.score)) ** 2, 0), sst = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  return { a, b, r2: sst ? 1 - ssr / sst : null, fitted };
}

export function buildRanking({ W, comp, res, wgiRes, def, E }, year = MIN_YEAR) {
  const ys = String(year);
  const raw = {};
  const meta = {};
  for (const c of UNIVERSE) {
    const w = W?.[c.iso3] || {};
    const k = comp?.[c.id];
    const compOk = k && Number(String(k.quarter).slice(0, 4)) >= MIN_YEAR;
    const r = res?.[c.iso3];
    const resOk = r && r.y >= MIN_YEAR;
    const gdpUsd = w.NGDPD?.[ys] != null ? w.NGDPD[ys] : null; // FMI: PBI en USD
    const resUsd = resOk ? r.v : null; // Banco Mundial: reservas en USD
    const wg = wgiRes ? Object.values(wgiRes).map((m) => m[c.iso3]).filter((x) => x && x.y >= MIN_YEAR) : [];
    const d = def?.[c.boc];
    const lastDefault = d?.lastYear ?? null;
    const yearsNoDefault = d && d.dataTo >= MIN_YEAR ? Math.min(HIST_CAP, lastDefault == null ? HIST_CAP : Math.max(0, d.dataTo - lastDefault)) : null;
    const intRev = w.GGXONLB_NGDP?.[ys] != null && w.GGXCNL_NGDP?.[ys] != null && w.GGR_NGDP?.[ys] ? ((w.GGXONLB_NGDP[ys] - w.GGXCNL_NGDP[ys]) / w.GGR_NGDP[ys]) * 100 : null;
    // Chile: la residencia del acreedor en QPSD no es creíble (ver Sostenibilidad): no se usa.
    const extShare = compOk && c.id !== 'cl' ? k.extShare : null;
    const fxDebtUsd = compOk && k.fx != null && gdpUsd != null ? (k.fx / 100) * gdpUsd : null;
    raw[c.id] = {
      debt: w.GGXWDG_NGDP?.[ys] ?? null,
      intRev,
      fb: w.GGXCNL_NGDP?.[ys] ?? null,
      fxShare: compOk ? k.fxShare : null,
      extShare,
      due12m: compOk ? k.due12m : null,
      ca: w.BCA_NGDPD?.[ys] ?? null,
      resGdp: resUsd != null && gdpUsd ? (resUsd / gdpUsd) * 100 : null,
      fxDebtRes: fxDebtUsd != null && resUsd ? fxDebtUsd / resUsd : null,
      wgi: wg.length === 6 ? wg.reduce((s, x) => s + x.v, 0) / 6 : null,
      yearsNoDefault,
    };
    meta[c.id] = {
      compQuarter: compOk ? k.quarter : null, compSector: compOk ? k.sectorLabel : null, due12mPartial: compOk ? !!k.due12mPartial : false,
      resYear: resOk ? r.y : null, wgiYear: wg[0]?.y ?? null, lastDefault, lastDefaultAmount: d?.lastAmount ?? null, defaultDataTo: d?.dataTo ?? null,
    };
  }
  // Puntaje por indicador → por pilar → total.
  const ind = {};
  for (const I of INDICATORS) ind[I.key] = scoreIndicator(Object.fromEntries(UNIVERSE.map((c) => [c.id, raw[c.id][I.key]])), I.better);
  const spreads = Object.fromEntries(UNIVERSE.map((c) => [c.id, E?.series?.[c.id]?.at(-1) ?? null]));
  const countries = UNIVERSE.map((c) => {
    const pillars = {};
    for (const P of PILLARS) {
      const s = INDICATORS.filter((I) => I.pillar === P.key).map((I) => ind[I.key][c.id]).filter(Number.isFinite);
      pillars[P.key] = s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
    }
    const avail = PILLARS.filter((P) => pillars[P.key] != null);
    const wsum = avail.reduce((s, P) => s + P.weight, 0);
    const total = wsum ? avail.reduce((s, P) => s + pillars[P.key] * P.weight, 0) / wsum : null;
    const missing = INDICATORS.filter((I) => raw[c.id][I.key] == null).map((I) => I.key);
    return {
      id: c.id, name: c.name, raw: raw[c.id], scores: Object.fromEntries(INDICATORS.map((I) => [I.key, ind[I.key][c.id] ?? null])),
      pillars, total, coverage: wsum, missing, meta: meta[c.id],
      spread: spreads[c.id]?.v ?? null, spreadDate: spreads[c.id]?.d ?? null,
    };
  });
  const fit = fitSpreads(countries.map((c) => ({ id: c.id, score: c.total, spread: c.spread })));
  for (const c of countries) {
    const f = fit?.fitted[c.id];
    c.spreadFit = f ?? null;
    c.spreadGap = f != null && c.spread != null ? c.spread - f : null; // >0: paga más de lo que justifican los fundamentos
  }
  countries.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  countries.forEach((c, i) => { c.rank = c.total == null ? null : i + 1; });
  return { countries, fit: fit && { a: fit.a, b: fit.b, r2: fit.r2 } };
}

export default async function ranking() {
  const errors = [];
  const d = await settle(
    {
      'FMI WEO 2025': weo2025,
      'Banco Mundial composición de la deuda (QPSD)': () => debtComposition(UNIVERSE.filter((c) => c.id !== 'ec').map((c) => ({ id: c.id, wb: c.iso3 })), { CHL: 'BC' }),
      'Ecuador composición de la deuda (Ministerio de Economía)': ecuadorDebt,
      'Banco Mundial reservas': () => wbLatest('FI.RES.TOTL.CD'),
      'Banco Mundial gobernanza (WGI)': wgi,
      'BoC-BoE defaults': defaults,
      'BCRD EMBI': embi,
    },
    errors
  );
  const W = d['FMI WEO 2025'];
  const comp = { ...(d['Banco Mundial composición de la deuda (QPSD)'] || {}) };
  if (d['Ecuador composición de la deuda (Ministerio de Economía)']) comp.ec = d['Ecuador composición de la deuda (Ministerio de Economía)'];
  const out = buildRanking({ W: W?.data, comp, res: d['Banco Mundial reservas'],
    wgiRes: d['Banco Mundial gobernanza (WGI)'], def: d['BoC-BoE defaults'], E: d['BCRD EMBI'] });
  return {
    id: 'rank',
    name: 'Ranking de emisores',
    year: MIN_YEAR,
    pillars: PILLARS,
    indicators: INDICATORS,
    ...out,
    defaultThreshold: DEFAULT_MIN_USD_M,
    sources: { weo: WEO_URL, qpsd: QPSD_URL, ecDebt: EC_DEBT_PAGE, wgi: WGI_URL, boc: BOC_PAGE, embi: EMBI_PAGE },
    errors,
  };
}
