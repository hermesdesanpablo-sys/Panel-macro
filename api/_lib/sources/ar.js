// Argentina: BCRA (API de estadísticas v4 + REM), Hacienda (resultado fiscal mensual), BCRD (EMBI) y Yahoo (ARGT).
//
// - El BCRA dejó de publicar tasa de política en jul-2025: se usa la TAMAR de bancos privados como tasa de referencia
//   y la tasa de pases entre terceros a 1 día como tasa de corto plazo de mercado.
// - Inflación (INDEC) y mediana de inflación esperada a 12 meses (REM) vienen en la misma API del BCRA.
// - REM completo: planilla "relevamiento-expectativas-mercado-tablas-AAAA-MM.xlsx" (el link se toma de la página del REM).
import { getJson, getText, clean, iso, daysAgo, settle, kpi, merge, thin, last, upcoming } from '../util.js';
import { yahooSeries, perf } from '../yahoo.js';
import { meetingEvents } from '../calendar.js';
import { readFirstSheet, excelDate } from '../xlsx.js';
import { embi, EMBI_PAGE } from './usd.js';
import { officialAr, weoSeries } from './sust.js';

const BCRA_API = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias';
const BCRA_URL = 'https://www.bcra.gob.ar/PublicacionesEstadisticas/Principales_variables.asp';
const REM_PAGE = 'https://www.bcra.gob.ar/relevamiento-expectativas-mercado-rem/';
export const BCRA = {
  reservas: 1, a3500: 5, badlar: 7, pases1d: 150, tamar: 44,
  inflM: 27, inflA: 28, rem12: 29, bandaInf: 1187, bandaSup: 1188,
};

export function parseBcra(j) {
  const r = j?.results?.[0];
  if (!r) throw new Error('BCRA: respuesta sin resultados');
  return clean((r.detalle || []).map((p) => ({ d: String(p.fecha).slice(0, 10), v: Number(p.valor) })));
}
export async function bcra(id, from) {
  return parseBcra(await getJson(`${BCRA_API}/${id}?desde=${iso(from)}&hasta=${iso(new Date())}&limit=3000`, { timeout: 25000 }));
}

// ---------- REM ----------
/** Planilla de resultados del REM → { sección: [{ periodo, ref, mediana }] } y fecha del relevamiento. */
export function parseRem(rows) {
  const out = {};
  let sec = null;
  for (const r of rows) {
    const [, a = '', b = '', c = ''] = r.map((x) => String(x ?? '').trim());
    if (a && !b && !c && !/^Fuente/i.test(a)) { sec = a.replace(/\s+/g, ' '); out[sec] = []; continue; }
    if (!sec || a === 'Período' || !c || !Number.isFinite(Number(c))) continue;
    const per = /^\d{5}$/.test(a) ? excelDate(a).slice(0, 7) : a;
    out[sec].push({ periodo: per, ref: b, mediana: Number(c) });
  }
  const fuente = rows.flat().map(String).find((x) => /Fuente: REM/i.test(x));
  if (!Object.keys(out).length) throw new Error('REM: planilla sin secciones (¿cambió el formato?)');
  return { secciones: out, relevamiento: fuente?.match(/\(([^)]+)\)/)?.[1] || null };
}
async function rem() {
  const html = await getText(REM_PAGE, { timeout: 20000 });
  const path = html.match(/href="([^"]*relevamiento-expectativas-mercado-tablas-\d{4}-\d{2}\.xlsx)"/)?.[1];
  if (!path) throw new Error('REM: no encuentro el link a la planilla de resultados');
  const url = new URL(path, 'https://www.bcra.gob.ar').toString();
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (macro-dashboard)' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en la planilla del REM`);
  return { ...parseRem(readFirstSheet(Buffer.from(await r.arrayBuffer()))), url };
}
const findSec = (secs, re) => Object.entries(secs).find(([k]) => re.test(k))?.[1] || [];
const findRow = (rows, re) => rows.find((x) => re.test(x.periodo) || re.test(x.ref));

export default async function argentina() {
  const errors = [];
  const from = daysAgo(800);
  const d = await settle(
    {
      'BCRA reservas': () => bcra(BCRA.reservas, from),
      'BCRA tipo de cambio mayorista': () => bcra(BCRA.a3500, from),
      'BCRA banda inferior': () => bcra(BCRA.bandaInf, daysAgo(400)),
      'BCRA banda superior': () => bcra(BCRA.bandaSup, daysAgo(400)),
      'BCRA TAMAR': () => bcra(BCRA.tamar, from),
      'BCRA BADLAR': () => bcra(BCRA.badlar, from),
      'BCRA pases 1 día': () => bcra(BCRA.pases1d, from),
      'BCRA inflación mensual': () => bcra(BCRA.inflM, daysAgo(1100)),
      'BCRA inflación interanual': () => bcra(BCRA.inflA, daysAgo(1100)),
      'BCRA REM inflación 12m': () => bcra(BCRA.rem12, daysAgo(1100)),
      'BCRA REM (planilla)': rem,
      'BCRD EMBI': embi,
      'Hacienda resultado fiscal': async () => officialAr(await weoSeries('ARG', 'NGDP')),
      'Yahoo ARGT': () => yahooSeries('ARGT'),
    },
    errors
  );
  const S = (k) => d[k] || [];
  const tamar = S('BCRA TAMAR'), a3500 = S('BCRA tipo de cambio mayorista');
  const inflA = S('BCRA inflación interanual'), rem12 = S('BCRA REM inflación 12m');
  const bcraSrc = (id) => ({ source: `BCRA API v4 (variable ${id})`, url: BCRA_URL });
  const fiscal = d['Hacienda resultado fiscal'];
  const E = d['BCRD EMBI'];
  // EMBI en puntos porcentuales → KPI en pb (las variaciones de kpi() ya salen en pb con unit '%').
  const embiAr = E?.series?.ar || [];
  const embiKpi = kpi({ key: 'embi', group: 'market', label: 'Riesgo país (EMBI)', series: embiAr.map((p) => ({ d: p.d, v: p.v / 100 })), changeDays: 30, source: 'J.P. Morgan EMBI vía BCRD', url: EMBI_PAGE });
  if (embiKpi.value != null) Object.assign(embiKpi, { value: embiKpi.value * 100, unit: ' pb', decimals: 0, spark: embiKpi.spark?.map((p) => ({ d: p.d, v: p.v * 100 })) });

  // REM: tabla y trayectoria de inflación mensual esperada.
  const R = d['BCRA REM (planilla)'];
  const secs = R?.secciones || {};
  const ipc = findSec(secs, /IPC nivel general/i), nucleo = findSec(secs, /IPC n[uú]cleo/i), tam = findSec(secs, /TAMAR/i);
  const tc = findSec(secs, /Tipo de cambio/i), pib = findSec(secs, /PIB/i), prim = findSec(secs, /Resultado Primario/i), des = findSec(secs, /Desocupaci/i);
  const val = (rows, re) => findRow(rows, re)?.mediana ?? null;
  const y = new Date().getUTCFullYear();
  const remSrc = { source: `BCRA – REM${R?.relevamiento ? ` (${R.relevamiento})` : ''}`, url: R?.url || REM_PAGE };
  const expectations = R
    ? [{
        title: 'Relevamiento de Expectativas de Mercado (REM, mediana)',
        columns: ['Variable', 'Mediana'],
        rows: [
          ['Inflación próximos 12 meses (%)', val(ipc, /12 meses/)],
          ['Inflación próximos 24 meses (%)', val(ipc, /24 meses/)],
          [`Inflación diciembre ${y} (% a/a)`, val(ipc, new RegExp(`^${y}$`))],
          [`Inflación diciembre ${y + 1} (% a/a)`, val(ipc, new RegExp(`^${y + 1}$`))],
          ['Inflación núcleo próximos 12 meses (%)', val(nucleo, /12 meses/)],
          [`TAMAR diciembre ${y} (TNA %)`, val(tam, new RegExp(`^${y}$`))],
          [`TAMAR diciembre ${y + 1} (TNA %)`, val(tam, new RegExp(`^${y + 1}$`))],
          [`Tipo de cambio diciembre ${y} ($/USD)`, val(tc, new RegExp(`^${y}$`))],
          [`Tipo de cambio diciembre ${y + 1} ($/USD)`, val(tc, new RegExp(`^${y + 1}$`))],
          [`PIB ${y} (var. % promedio)`, val(pib, new RegExp(`^${y}$`))],
          [`PIB ${y + 1} (var. % promedio)`, val(pib, new RegExp(`^${y + 1}$`))],
          [`Resultado primario SPNF ${y} (miles de millones $)`, val(prim, new RegExp(`^${y}$`))],
          [`Desocupación IV trim. ${y} (% PEA)`, val(des, new RegExp(`^${y}$`))],
        ].filter((r) => r[1] != null),
        asOf: null,
        ...remSrc,
      }]
    : [];
  const monthly = ipc.filter((x) => /^\d{4}-\d{2}$/.test(x.periodo));
  const path = monthly.length
    ? { title: 'Inflación mensual esperada (REM, mediana)', kind: 'survey', path: monthly.map((x) => ({ label: x.periodo, rate: x.mediana })), current: last(S('BCRA inflación mensual'))?.v, currentLabel: 'Último dato', note: 'Variación mensual del IPC esperada por los analistas del REM.', ...remSrc }
    : null;
  const remTamar12 = val(tam, /12 meses/);
  const tamarKpi = kpi({ key: 'exp_rate', group: 'expectations', label: 'TAMAR esperada en 12 meses (REM)', series: remTamar12 != null ? [{ d: iso(new Date()), v: remTamar12 }] : [], note: 'Solo el último relevamiento (sin historia en la API)', ...remSrc });

  const pb = fiscal?.series?.pb || [], fb = fiscal?.series?.fb || [];
  const fiscalSrc = { source: 'Hacienda – SPN base caja (cálculo propio, 12 meses / PBI FMI)', url: fiscal?.url };
  const ech = d['Yahoo ARGT'];
  return {
    id: 'ar',
    name: 'Argentina',
    flag: '🇦🇷',
    currency: 'ARS',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'TAMAR bancos privados (TNA)', series: tamar, changeDays: 365, note: 'Sin tasa de política del BCRA desde jul-2025: TAMAR como referencia', ...bcraSrc(BCRA.tamar) }),
      kpi({ key: 'pases', group: 'policy', label: 'Pases entre terceros a 1 día (TNA)', series: S('BCRA pases 1 día'), ...bcraSrc(BCRA.pases1d) }),
      kpi({ key: 'cpi', group: 'inflation', label: 'Inflación a/a (INDEC)', series: inflA, decimals: 1, changeDays: 365, ...bcraSrc(BCRA.inflA) }),
      kpi({ key: 'cpi_m', group: 'inflation', label: 'Inflación mensual (INDEC)', series: S('BCRA inflación mensual'), decimals: 1, ...bcraSrc(BCRA.inflM) }),
      kpi({ key: 'exp_cpi', group: 'expectations', label: 'Inflación esperada 12 meses (REM)', series: rem12, decimals: 1, ...bcraSrc(BCRA.rem12) }),
      tamarKpi,
      embiKpi,
      kpi({ key: 'badlar', group: 'market', label: 'BADLAR bancos privados (TNA)', series: S('BCRA BADLAR'), ...bcraSrc(BCRA.badlar) }),
      kpi({ key: 'fx', group: 'fx', label: 'USD/ARS mayorista (A3500)', series: a3500, unit: '', decimals: 2, changeDays: 365, ...bcraSrc(BCRA.a3500) }),
      kpi({ key: 'reserves', group: 'fx', label: 'Reservas (US$ mn)', series: S('BCRA reservas'), unit: '', decimals: 0, ...bcraSrc(BCRA.reservas) }),
      kpi({ key: 'pb12', group: 'activity', label: 'Resultado primario SPN 12m (% PBI)', series: pb, ...fiscalSrc }),
      kpi({ key: 'fb12', group: 'activity', label: 'Resultado financiero SPN 12m (% PBI)', series: fb, ...fiscalSrc }),
    ],
    equity: ech ? { msci: { ticker: 'ARGT', label: 'Global X MSCI Argentina (ARGT, USD)', series: ech, perf: perf(ech) }, local: null } : null,
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'TAMAR vs inflación a/a',
        unit: '%',
        lines: [{ key: 'tamar', label: 'TAMAR (TNA)' }, { key: 'infl', label: 'Inflación a/a' }],
        data: merge({ tamar: thin(tamar), infl: inflA.filter((p) => p.d >= (tamar[0]?.d || '')) }),
      },
      {
        id: 'fx',
        title: 'USD/ARS mayorista y bandas cambiarias',
        unit: '',
        lines: [{ key: 'v', label: 'A3500' }, { key: 'sup', label: 'Banda superior' }, { key: 'inf', label: 'Banda inferior' }],
        data: merge({ v: thin(a3500.filter((p) => p.d >= iso(daysAgo(400)))), sup: thin(S('BCRA banda superior')), inf: thin(S('BCRA banda inferior')) }),
      },
      { id: 'embi', title: 'Riesgo país: spread EMBI (pb)', unit: ' pb', lines: [{ key: 'v', label: 'EMBI Argentina' }], data: embiAr.filter((p) => p.d >= iso(daysAgo(800))).map((p) => ({ d: p.d, v: p.v })) },
      {
        id: 'fiscal',
        title: 'Resultado fiscal SPN, acumulado 12 meses (% del PBI)',
        unit: '%',
        lines: [{ key: 'pb', label: 'Primario' }, { key: 'fb', label: 'Financiero' }],
        data: merge({ pb, fb }),
      },
      {
        id: 'exp-cpi',
        group: 'exp',
        title: 'Inflación a/a vs esperada a 12 meses (REM)',
        unit: '%',
        lines: [{ key: 'infl', label: 'Inflación a/a' }, { key: 'rem', label: 'REM 12 meses' }],
        data: merge({ infl: inflA, rem: rem12 }),
      },
    ],
    expectations,
    path,
    calendar: upcoming(meetingEvents('ar')),
    errors,
  };
}
