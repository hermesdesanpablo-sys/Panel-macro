// Sostenibilidad: tres brechas (externa, fiscal y privada) y trayectoria de deuda/PBI por país.
//
// Fuentes (sin clave):
// - FMI World Economic Outlook por la API SDMX oficial (api.imf.org): historia desde 1980 y proyecciones a 5 años.
//   (La API "DataMapper" de imf.org bloquea consultas automáticas; esta es la vía oficial para máquinas.)
// - Banco Mundial (WDI): balanza comercial de bienes y servicios, deuda externa, reservas y servicio de deuda externa.
//
// Identidad de las tres brechas (en % del PBI):  cuenta corriente = (S − I) total = resultado fiscal + (S − I) privado.
// Capacidad de repago: resultado primario que estabiliza la deuda  pb* = d₋₁ · (i − g) / (1 + g),
// con i = tasa implícita (intereses / deuda del año anterior) y g = crecimiento del PBI nominal.
import { getJson, settle, clean, iso, daysAgo } from '../util.js';
import { fred } from './us.js';
import { sgs } from './br.js';

export const COUNTRIES = [
  { id: 'ar', name: 'Argentina', weo: 'ARG', wb: 'ARG' },
  { id: 'br', name: 'Brasil', weo: 'BRA', wb: 'BRA' },
  { id: 'cl', name: 'Chile', weo: 'CHL', wb: 'CHL' },
  { id: 'co', name: 'Colombia', weo: 'COL', wb: 'COL' },
  { id: 'mx', name: 'México', weo: 'MEX', wb: 'MEX' },
  { id: 'pe', name: 'Perú', weo: 'PER', wb: 'PER' },
  { id: 'uy', name: 'Uruguay', weo: 'URY', wb: 'URY' },
  { id: 'us', name: 'Estados Unidos', weo: 'USA', wb: 'USA' },
  { id: 'ca', name: 'Canadá', weo: 'CAN', wb: 'CAN' },
  { id: 'eu', name: 'Eurozona', weo: 'G163', wb: 'EMU' },
  { id: 'jp', name: 'Japón', weo: 'JPN', wb: 'JPN' },
];
const WEO = {
  ca: 'BCA_NGDPD', // cuenta corriente, % PBI
  fb: 'GGXCNL_NGDP', // resultado fiscal (préstamo neto del gobierno general), % PBI
  pb: 'GGXONLB_NGDP', // resultado primario, % PBI
  debt: 'GGXWDG_NGDP', // deuda bruta del gobierno general, % PBI
  sav: 'NGSD_NGDP', // ahorro nacional bruto, % PBI
  inv: 'NID_NGDP', // inversión total, % PBI
  ngdp: 'NGDP', // PBI nominal en moneda local (para el crecimiento nominal)
  growth: 'NGDP_RPCH', // crecimiento real, %
  cpiEop: 'PCPIEPCH', // inflación diciembre contra diciembre, %
  cpiAvg: 'PCPIPCH', // inflación promedio anual, %
};
const WB = {
  trade: 'NE.RSB.GNFS.ZS', // balanza de bienes y servicios, % PBI
  extDebt: 'DT.DOD.DECT.GN.ZS', // deuda externa total, % del ingreso nacional bruto (solo emergentes)
  resMonths: 'FI.RES.TOTL.MO', // reservas en meses de importaciones
  extService: 'DT.TDS.DECT.EX.ZS', // servicio de deuda externa, % de exportaciones (solo emergentes)
};
export const WEO_URL = 'https://www.imf.org/en/Publications/WEO';
const WB_URL = 'https://databank.worldbank.org/source/world-development-indicators';
const FIRST_YEAR = 2005;

/** Respuesta SDMX-JSON 3.0 del FMI → { país: { indicador: { año: valor } } } y fecha de actualización por país. */
export function parseWeo(j) {
  const st = j?.data?.structures?.[0];
  const ds = j?.data?.dataSets?.[0]?.series;
  if (!st || !ds) throw new Error('FMI WEO: respuesta sin series');
  const dims = st.dimensions.series;
  const times = st.dimensions.observation[0].values.map((v) => v.id ?? v.value);
  const ci = dims.findIndex((d) => d.id === 'COUNTRY'), ii = dims.findIndex((d) => d.id === 'INDICATOR');
  const attrIds = (st.attributes?.series || []).map((a) => a.id);
  const upd = attrIds.indexOf('COUNTRY_UPDATE_DATE');
  const out = {}, updated = {};
  for (const [key, s] of Object.entries(ds)) {
    const k = key.split(':').map(Number);
    const c = dims[ci].values[k[ci]].id, ind = dims[ii].values[k[ii]].id;
    out[c] ??= {};
    out[c][ind] = Object.fromEntries(Object.entries(s.observations || {}).map(([t, v]) => [times[+t], parseFloat(v[0])]).filter(([, v]) => Number.isFinite(v)));
    if (upd >= 0 && s.attributes?.[upd]) updated[c] = s.attributes[upd];
  }
  return { data: out, updated };
}

async function weo() {
  const key = `${COUNTRIES.map((c) => c.weo).join('+')}.${Object.values(WEO).join('+')}.A`;
  const j = await getJson(`https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/+/${key}?startPeriod=${FIRST_YEAR - 1}`, { timeout: 30000 });
  return parseWeo(j);
}

/** Un indicador del Banco Mundial para todos los países: { códigoISO3: { año: valor } }. */
async function wb(indicator) {
  const codes = COUNTRIES.map((c) => c.wb).join(';');
  const j = await getJson(`https://api.worldbank.org/v2/country/${codes}/indicator/${indicator}?format=json&date=${FIRST_YEAR}:2030&per_page=1000`, { timeout: 30000 });
  const out = {};
  for (const r of j?.[1] || []) {
    if (r.value == null) continue;
    (out[r.countryiso3code] ??= {})[r.date] = r.value;
  }
  return out;
}

// ---------- Datos oficiales nacionales (más frecuentes que el WEO; perímetro y método de cada país) ----------
// Cada uno devuelve { debt?, pb?, fb?, series: { debt?, pb?, fb? } } con { v, d, label, freq } en % del PBI.
const last = (s) => s[s.length - 1];
const ok = (s) => s && s.length;
/**
 * Últimos 4 trimestres. Eurostat expresa cada trimestre en % del PBI DEL TRIMESTRE → se promedia; el BCCh lo expresa en
 * % del PBI ANUAL → se suma (validado: CL 2024 suma −2,89% vs anual −2,86%; EA 2025 promedio −3,0% = anual).
 */
const roll4 = (s, mode = 'avg') => clean(s.map((p, i) => {
  if (i < 3) return null;
  const sum = s[i].v + s[i - 1].v + s[i - 2].v + s[i - 3].v;
  return { d: p.d, v: mode === 'sum' ? sum : sum / 4 };
}).filter(Boolean));

async function datosAr(ids, start) {
  const j = await getJson(`https://apis.datos.gob.ar/series/api/series/?ids=${ids.join(',')}&start_date=${start}&limit=1000`, { timeout: 25000 });
  return ids.map((_, k) => clean((j.data || []).map((r) => ({ d: r[0], v: r[k + 1] }))));
}

/** Argentina: Sector Público Nacional base caja (Hacienda), mensual → acumulado 12 meses en % del PBI. */
async function officialAr(ngdp) {
  const [pbM, fbM] = await datosAr(['379.9_SUPERAVIT_017__23_94', '379.9_RESULTADO_017__18_38'], iso(daysAgo(365 * 4)).slice(0, 7) + '-01');
  // PBI de los 12 meses que terminan en el mes m: interpolación lineal del PBI nominal anual del FMI (en pesos).
  const gdp12 = (d) => {
    const y = +d.slice(0, 4), m = +d.slice(5, 7);
    const a = ngdp?.[String(y)], b = ngdp?.[String(y - 1)];
    return a && b ? a * (m / 12) + b * (1 - m / 12) : null;
  };
  const roll12 = (s) => clean(s.map((p, i) => {
    if (i < 11) return null;
    const g = gdp12(p.d);
    const sum = s.slice(i - 11, i + 1).reduce((a, x) => a + x.v, 0);
    return g ? { d: p.d, v: ((sum * 1e6) / g) * 100 } : null; // Hacienda en millones de pesos; PBI del FMI en pesos
  }).filter(Boolean));
  const pb = roll12(pbM), fb = roll12(fbM);
  const lbl = 'Sector Público Nacional, base caja (Hacienda), acumulado 12 meses';
  return {
    pb: ok(pb) ? { ...last(pb), label: lbl, freq: 'mensual' } : null,
    fb: ok(fb) ? { ...last(fb), label: lbl, freq: 'mensual' } : null,
    series: { pb, fb },
    url: 'https://www.argentina.gob.ar/economia/sechacienda/informacion-fiscal',
  };
}

/** Brasil (BCB): DBGG metodología BCB y NFSP 12 meses (positivo = déficit → se invierte el signo). */
async function officialBr() {
  const from = daysAgo(365 * 4);
  const [debt, prim, nom] = await Promise.all([sgs(13762, from), sgs(5793, from), sgs(5727, from)]);
  const neg = (s) => s.map((p) => ({ d: p.d, v: -p.v }));
  const pb = neg(prim), fb = neg(nom);
  return {
    debt: ok(debt) ? { ...last(debt), label: 'Deuda bruta del gobierno general (DBGG, metodología BCB)', freq: 'mensual' } : null,
    pb: ok(pb) ? { ...last(pb), label: 'Sector público consolidado, 12 meses (BCB, NFSP)', freq: 'mensual' } : null,
    fb: ok(fb) ? { ...last(fb), label: 'Sector público consolidado, nominal 12 meses (BCB, NFSP)', freq: 'mensual' } : null,
    series: { debt, pb, fb },
    url: 'https://www.bcb.gov.br/estatisticas/estatisticasfiscais',
  };
}

/** EE.UU. (FRED): deuda pública federal / PBI (trimestral) y resultado federal / PBI (año fiscal). */
async function officialUs() {
  const [debt, fb] = await Promise.all([fred('GFDEGDQ188S', daysAgo(365 * 6)), fred('FYFSGDA188S', daysAgo(365 * 8))]);
  return {
    debt: ok(debt) ? { ...last(debt), label: 'Deuda pública federal total (FRED GFDEGDQ188S)', freq: 'trimestral' } : null,
    fb: ok(fb) ? { ...last(fb), label: 'Resultado del gobierno federal, año fiscal (FRED FYFSGDA188S)', freq: 'anual' } : null,
    series: { debt, fb },
    url: 'https://fred.stlouisfed.org/series/GFDEGDQ188S',
  };
}

/** Eurozona (Eurostat): deuda del gobierno general trimestral y déficit (promedio 4 trimestres). */
async function eurostat(dataset, q) {
  const j = await getJson(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${q}&sinceTimePeriod=2021-Q1`, { timeout: 25000 });
  const t = j.dimension.time.category.index;
  return clean(Object.entries(t).map(([k, i]) => {
    const [y, qq] = k.split('-Q');
    return { d: `${y}-${String(qq * 3 - 2).padStart(2, '0')}-01`, v: j.value[String(i)] };
  }).filter((p) => p.v != null));
}
async function officialEu() {
  const [debt, b9] = await Promise.all([
    eurostat('gov_10q_ggdebt', 'geo=EA20&unit=PC_GDP&sector=S13&na_item=GD'),
    eurostat('gov_10q_ggnfa', 'geo=EA20&unit=PC_GDP&sector=S13&na_item=B9&s_adj=NSA'),
  ]);
  const fb = roll4(b9);
  return {
    debt: ok(debt) ? { ...last(debt), label: 'Deuda del gobierno general, zona euro (Eurostat)', freq: 'trimestral' } : null,
    fb: ok(fb) ? { ...last(fb), label: 'Resultado del gobierno general, promedio 4 trimestres (Eurostat)', freq: 'trimestral' } : null,
    series: { debt, fb },
    url: 'https://ec.europa.eu/eurostat/web/government-finance-statistics',
  };
}

/** Chile (BCCh, API con token): deuda bruta y balance global del gobierno central, trimestrales. */
async function officialCl() {
  const tok = process.env.BCCH_API_TOKEN;
  if (!tok) return null; // sin token: Chile queda solo con el FMI (no es un error)
  const get = async (code) => {
    const qs = new URLSearchParams({ token: tok, function: 'GetSeries', timeseries: code, firstdate: iso(daysAgo(365 * 6)) });
    const r = await fetch(`https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?${qs}`, { signal: AbortSignal.timeout(20000) });
    const j = JSON.parse(new TextDecoder('latin1').decode(await r.arrayBuffer()));
    if (j.Codigo !== 0) throw new Error(`API BCCh: ${j.Descripcion}`);
    return clean((j.Series?.Obs || []).map((o) => { const [dd, mm, yy] = o.indexDateString.split('-'); return { d: `${yy}-${mm}-${dd}`, v: parseFloat(o.value) }; }));
  };
  const [debt, bq] = await Promise.all([get('F051.D7.PPB.C.Z.Z.T'), get('F051.G21.PPI.C.Z.Z.T')]);
  const fb = roll4(bq, 'sum');
  return {
    debt: ok(debt) ? { ...last(debt), label: 'Deuda bruta del Gobierno Central (BCCh)', freq: 'trimestral' } : null,
    fb: ok(fb) ? { ...last(fb), label: 'Balance global del Gobierno Central, últimos 4 trimestres (BCCh)', freq: 'trimestral' } : null,
    series: { debt, fb },
    url: 'https://si3.bcentral.cl/Siete/es/Siete/API',
  };
}

const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/** Arma la ficha de un país: series anuales alineadas, brecha privada y primario estabilizador de deuda. */
export function buildCountry(c, W, B, projFrom) {
  const g = (ind, y) => W?.[ind]?.[y];
  const years = [];
  for (let y = FIRST_YEAR; y <= projFrom + 5; y++) years.push(y);
  const rows = years.map((y) => {
    const ys = String(y), yp = String(y - 1);
    const ca = g(WEO.ca, ys), fb = g(WEO.fb, ys), pb = g(WEO.pb, ys), debt = g(WEO.debt, ys), debtPrev = g(WEO.debt, yp);
    const n = g(WEO.ngdp, ys), nPrev = g(WEO.ngdp, yp);
    const gNom = n && nPrev ? n / nPrev - 1 : null;
    const interest = pb != null && fb != null ? pb - fb : null; // intereses netos, % PBI
    const iEff = interest != null && debtPrev && gNom != null ? (interest / 100) * (1 + gNom) / (debtPrev / 100) : null;
    const pbStar = iEff != null && gNom != null && debtPrev != null ? debtPrev * (iEff - gNom) / (1 + gNom) : null;
    return {
      y,
      proj: y >= projFrom,
      ca: r2(ca), fb: r2(fb), pb: r2(pb), priv: ca != null && fb != null ? r2(ca - fb) : null,
      sav: r2(g(WEO.sav, ys)), inv: r2(g(WEO.inv, ys)), debt: r2(debt), growth: r2(g(WEO.growth, ys)),
      cpiEop: r2(g(WEO.cpiEop, ys)), cpiAvg: r2(g(WEO.cpiAvg, ys)),
      gNom: gNom == null ? null : r2(gNom * 100), interest: r2(interest), iEff: iEff == null ? null : r2(iEff * 100),
      pbStar: r2(pbStar), pbGap: pb != null && pbStar != null ? r2(pb - pbStar) : null,
      trade: r2(B.trade?.[c.wb]?.[ys]), extDebt: r2(B.extDebt?.[c.wb]?.[ys]), resMonths: r2(B.resMonths?.[c.wb]?.[ys]), extService: r2(B.extService?.[c.wb]?.[ys]),
    };
  });
  const at = (y) => rows.find((r) => r.y === y) || {};
  const lastActual = at(projFrom - 1), end = at(projFrom + 5), y1 = at(projFrom - 2), y2 = at(projFrom - 3), next = at(projFrom);
  const avg = (key, from, to) => {
    const v = rows.filter((r) => r.y >= from && r.y <= to && r[key] != null).map((r) => r[key]);
    return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const lastWith = (key) => [...rows].reverse().find((r) => !r.proj && r[key] != null);
  return {
    id: c.id, name: c.name, cc: c.id === 'eu' ? 'eu' : c.id,
    rows,
    summary: {
      year: projFrom - 1, endYear: projFrom + 5,
      ca: lastActual.ca, fb: lastActual.fb, pb: lastActual.pb, priv: lastActual.priv,
      debt: lastActual.debt, debtEnd: end.debt,
      // Evolución reciente de la deuda/PBI: dos años atrás, uno atrás, último y variación en 2 años (puntos del PBI).
      debt2y: y2.debt ?? null, debt1y: y1.debt ?? null, debtChg2y: lastActual.debt != null && y2.debt != null ? r2(lastActual.debt - y2.debt) : null,
      cpiEop: lastActual.cpiEop ?? null, cpiEopNext: next.cpiEop ?? null, cpiAvg: lastActual.cpiAvg ?? null, growth: lastActual.growth ?? null, debtChg: lastActual.debt != null && end.debt != null ? r2(end.debt - lastActual.debt) : null,
      interest: lastActual.interest, iEff: lastActual.iEff, gNom: lastActual.gNom,
      pbStar: lastActual.pbStar, pbGap: lastActual.pbGap,
      pbProj: avg('pb', projFrom, projFrom + 5), pbStarProj: avg('pbStar', projFrom, projFrom + 5),
      trade: lastWith('trade')?.trade ?? null, tradeYear: lastWith('trade')?.y ?? null,
      extDebt: lastWith('extDebt')?.extDebt ?? null, resMonths: lastWith('resMonths')?.resMonths ?? null, extService: lastWith('extService')?.extService ?? null,
    },
  };
}

export default async function sustainability() {
  const errors = [];
  const d = await settle(
    {
      'FMI WEO': weo,
      'Banco Mundial balanza comercial': () => wb(WB.trade),
      'Banco Mundial deuda externa': () => wb(WB.extDebt),
      'Banco Mundial reservas': () => wb(WB.resMonths),
      'Banco Mundial servicio de deuda externa': () => wb(WB.extService),
    },
    errors
  );
  const W = d['FMI WEO'];
  if (!W) return { id: 'sust', name: 'Sostenibilidad', countries: [], errors };
  const off = await settle(
    {
      'Oficial Argentina (Hacienda)': () => officialAr(W.data.ARG?.NGDP),
      'Oficial Brasil (BCB)': officialBr,
      'Oficial EE.UU. (FRED)': officialUs,
      'Oficial Eurozona (Eurostat)': officialEu,
      'Oficial Chile (BCCh)': officialCl,
    },
    errors
  );
  const OFF = { ar: off['Oficial Argentina (Hacienda)'], br: off['Oficial Brasil (BCB)'], us: off['Oficial EE.UU. (FRED)'], eu: off['Oficial Eurozona (Eurostat)'], cl: off['Oficial Chile (BCCh)'] };
  // El WEO marca como estimación/proyección el año en curso y los siguientes (para la mayoría de los países).
  const projFrom = new Date().getUTCFullYear();
  const B = { trade: d['Banco Mundial balanza comercial'], extDebt: d['Banco Mundial deuda externa'], resMonths: d['Banco Mundial reservas'], extService: d['Banco Mundial servicio de deuda externa'] };
  return {
    id: 'sust',
    name: 'Sostenibilidad: tres brechas y deuda',
    flag: '⚖️',
    projFrom,
    weoVintage: Object.values(W.updated).sort().at(-1) || null,
    countries: COUNTRIES.map((c) => ({ ...buildCountry(c, W.data[c.weo], B, projFrom), official: OFF[c.id] || null })),
    sources: { weo: WEO_URL, wb: WB_URL },
    errors,
  };
}
