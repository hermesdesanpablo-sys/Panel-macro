// Dato real de publicaciones fuera de EE.UU., desde la fuente oficial (para el calendario económico).
// Cada resolvedor devuelve { raw, period, src, url } o null si la fuente todavía no tiene el dato de ese evento.
// Regla de frescura: la fecha de publicación de la fuente (StatCan releaseTime, ONS releaseDate, BCE updatedAfter) debe ser
// igual o posterior al día del evento; en Eurostat (sin fecha por serie) el último período con dato debe ser el esperado.
import { getJson, getText } from './util.js';

const etDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
/** Transformación sobre valores en orden descendente (v[0] = último). */
export function apply(vals, fn) {
  if (fn === 'level') return vals[0];
  if (fn === 'diff') return vals[0] - vals[1];
  if (fn === 'mom') return (vals[0] / vals[1] - 1) * 100;
  if (fn === 'yoy') return (vals[0] / vals[12] - 1) * 100;
  throw new Error(`transformación desconocida ${fn}`);
}

// ---------- Canadá: StatCan WDS (sin clave) ----------
const WDS = 'https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods';
async function statcan(ev, { vector, fn, scale = 1 }) {
  const j = await getJson(WDS, { method: 'POST', body: JSON.stringify([{ vectorId: vector, latestN: 14 }]), headers: { 'Content-Type': 'application/json' } });
  const pts = (j?.[0]?.object?.vectorDataPoint || []).filter((p) => p.value != null).sort((a, b) => (a.refPer < b.refPer ? 1 : -1));
  if (!pts.length || String(pts[0].releaseTime).slice(0, 10) < etDate(ev.time)) return null;
  return { raw: apply(pts.map((p) => Number(p.value)), fn) * scale, period: pts[0].refPer.slice(0, 7), src: `StatCan v${vector}`, url: `https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=${String(j[0].object.productId)}01` };
}

// ---------- Reino Unido: ONS (sin clave) ----------
const ONS_MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
async function ons(ev, { path, fn, freq = 'months' }) {
  const j = await getJson(`https://www.ons.gov.uk/${path}/data`);
  const rows = (j[freq] || []).filter((r) => r.value !== '');
  const rel = String(j.description?.releaseDate || '').slice(0, 10);
  if (!rows.length || rel < etDate(ev.time)) return null;
  const last = rows.at(-1).date; // '2026 OCT' | '2026 Q3'
  const [y, p] = last.split(' ');
  const period = ONS_MON[p] ? `${y}-${String(ONS_MON[p]).padStart(2, '0')}` : `${y}-${p}`;
  return { raw: apply(rows.slice().reverse().map((r) => Number(r.value)), fn), period, src: `ONS ${path.split('/').slice(-2).join('/').toUpperCase()}`, url: `https://www.ons.gov.uk/${path}` };
}

// ---------- Eurozona: BCE (HICP final) y Eurostat (PIB, desempleo) ----------
async function ecb(ev, { key }) {
  const since = `${etDate(ev.time)}T00:00:00Z`;
  let txt;
  try {
    txt = await getText(`https://data-api.ecb.europa.eu/service/data/${key}?format=csvdata&lastNObservations=1&updatedAfter=${since}`);
  } catch (e) {
    if (/HTTP 404/.test(e.message)) return null; // sin actualización desde el día del evento
    throw e;
  }
  const [h, row] = txt.trim().split('\n');
  const cols = h.split(','), vals = row.split(',');
  const get = (c) => vals[cols.indexOf(c)];
  return { raw: Number(get('OBS_VALUE')), period: get('TIME_PERIOD'), src: `BCE ${key}`, url: `https://data.ecb.europa.eu/data/datasets/${key.split('/')[0]}/${key.replace('/', '.')}` };
}
const shiftDays = (iso, n) => new Date(Date.parse(iso) - n * 864e5).toISOString().slice(0, 10);
async function eurostat(ev, { dataset, query, freq }) {
  const j = await getJson(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?format=JSON&${query}&lastTimePeriod=3`);
  const ix = j.dimension?.time?.category?.index || {};
  const pts = Object.entries(ix).map(([t, i]) => [t, j.value?.[String(i)]]).filter(([, v]) => v != null).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  if (!pts.length) return null;
  // Período esperado: desempleo (mensual) ≈ mes de (evento − 40 días); PIB (trimestral) ≈ trimestre de (evento − 70 días).
  const ref = shiftDays(ev.time, freq === 'Q' ? 70 : 40);
  const want = freq === 'Q' ? `${ref.slice(0, 4)}-Q${Math.ceil(Number(ref.slice(5, 7)) / 3)}` : ref.slice(0, 7);
  if (pts[0][0] !== want) return null;
  return { raw: pts[0][1], period: pts[0][0], src: `Eurostat ${dataset}`, url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table` };
}

const R = { statcan, ons, ecb, eurostat };
const S = (src, opts) => ({ src, ...opts });
// Títulos de Forex Factory por moneda → fuente oficial.
export const OFFICIAL_ACTUALS = {
  CAD: [
    [/^CPI m\/m$/, S('statcan', { vector: 41690973, fn: 'mom' })],
    [/^CPI y\/y$/, S('statcan', { vector: 41690973, fn: 'yoy' })],
    [/^Common CPI y\/y$/, S('statcan', { vector: 108785713, fn: 'level' })],
    [/^Median CPI y\/y$/, S('statcan', { vector: 108785714, fn: 'level' })],
    [/^Trimmed CPI y\/y$/, S('statcan', { vector: 108785715, fn: 'level' })],
    [/^Employment Change$/, S('statcan', { vector: 2062811, fn: 'diff' })], // miles
    [/^Unemployment Rate$/, S('statcan', { vector: 2062815, fn: 'level' })],
    [/^GDP m\/m$/, S('statcan', { vector: 65201210, fn: 'mom' })],
    [/^Retail Sales m\/m$/, S('statcan', { vector: 52367097, fn: 'mom' })],
  ],
  GBP: [
    [/^CPI y\/y$/, S('ons', { path: 'economy/inflationandpriceindices/timeseries/d7g7/mm23', fn: 'level' })],
    [/^Core CPI y\/y$/, S('ons', { path: 'economy/inflationandpriceindices/timeseries/dko8/mm23', fn: 'level' })],
    [/^CPI m\/m$/, S('ons', { path: 'economy/inflationandpriceindices/timeseries/d7oe/mm23', fn: 'level' })],
    [/^GDP m\/m$/, S('ons', { path: 'economy/grossdomesticproductgdp/timeseries/ecy2/mgdp', fn: 'mom' })],
    // PIB trimestral: la 1.ª estimación sale en el dataset PN2 y la revisada en QNA.
    [/^Prelim GDP q\/q$/, S('ons', { path: 'economy/grossdomesticproductgdp/timeseries/ihyq/pn2', fn: 'level', freq: 'quarters' })],
    [/^(Revised |Final )?GDP q\/q$/, S('ons', { path: 'economy/grossdomesticproductgdp/timeseries/ihyq/qna', fn: 'level', freq: 'quarters' })],
    [/^Unemployment Rate$/, S('ons', { path: 'employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms', fn: 'level' })],
    [/^Retail Sales m\/m$/, S('ons', { path: 'businessindustryandtrade/retailindustry/timeseries/j5ek/drsi', fn: 'mom' })],
  ],
  EUR: [
    // El flash de HICP no está en ninguna API pública (BCE y Eurostat solo tienen el definitivo): queda "—".
    [/^Final CPI y\/y$/, S('ecb', { key: 'HICP/M.U2.N.000000.4D0.ANR' })],
    [/^Final Core CPI y\/y$/, S('ecb', { key: 'HICP/M.U2.N.XEF000.4D0.ANR' })],
    [/^(Prelim |Revised )?(Flash )?GDP q\/q$/, S('eurostat', { dataset: 'namq_10_gdp', query: 'geo=EA21&unit=CLV_PCH_PRE&s_adj=SCA&na_item=B1GQ', freq: 'Q' })],
    [/^Unemployment Rate$/, S('eurostat', { dataset: 'une_rt_m', query: 'geo=EA21&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT', freq: 'M' })],
  ],
};

/** Dato real oficial de un evento de Forex Factory fuera de EE.UU. (null si no hay mapa o la fuente aún no lo publicó). */
export async function officialActual(ev) {
  const m = (OFFICIAL_ACTUALS[ev.ccy] || []).find(([re]) => re.test(ev.title))?.[1];
  if (!m) return undefined;
  return R[m.src](ev, m);
}
