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
import { getJson, settle } from '../util.js';

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
      gNom: gNom == null ? null : r2(gNom * 100), interest: r2(interest), iEff: iEff == null ? null : r2(iEff * 100),
      pbStar: r2(pbStar), pbGap: pb != null && pbStar != null ? r2(pb - pbStar) : null,
      trade: r2(B.trade?.[c.wb]?.[ys]), extDebt: r2(B.extDebt?.[c.wb]?.[ys]), resMonths: r2(B.resMonths?.[c.wb]?.[ys]), extService: r2(B.extService?.[c.wb]?.[ys]),
    };
  });
  const at = (y) => rows.find((r) => r.y === y) || {};
  const lastActual = at(projFrom - 1), end = at(projFrom + 5);
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
      debt: lastActual.debt, debtEnd: end.debt, debtChg: lastActual.debt != null && end.debt != null ? r2(end.debt - lastActual.debt) : null,
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
  // El WEO marca como estimación/proyección el año en curso y los siguientes (para la mayoría de los países).
  const projFrom = new Date().getUTCFullYear();
  const B = { trade: d['Banco Mundial balanza comercial'], extDebt: d['Banco Mundial deuda externa'], resMonths: d['Banco Mundial reservas'], extService: d['Banco Mundial servicio de deuda externa'] };
  return {
    id: 'sust',
    name: 'Sostenibilidad: tres brechas y deuda',
    flag: '⚖️',
    projFrom,
    weoVintage: Object.values(W.updated).sort().at(-1) || null,
    countries: COUNTRIES.map((c) => buildCountry(c, W.data[c.weo], B, projFrom)),
    sources: { weo: WEO_URL, wb: WB_URL },
    errors,
  };
}
