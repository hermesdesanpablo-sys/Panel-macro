// México: Banxico SIE API (requiere BANXICO_TOKEN gratuito) + Yahoo.
import { getJson, clean, dmyToIso, iso, daysAgo, settle, kpi, merge, thin, last, upcoming } from '../util.js';
import { equityBlock, yahooSeries } from '../yahoo.js';
import { meetingEvents } from '../calendar.js';

// Catálogo: https://www.banxico.org.mx/SieAPIRest/service/v1/doc/catalogoSeries
export const SIE = {
  objetivo: 'SF61745', // Tasa objetivo
  fix: 'SF43718', // Tipo de cambio FIX
  inflacion: 'SP30578', // Inflación anual INPC  (verificar en el catálogo)
  cetes28: 'SF43936', // Cetes 28 días, tasa de rendimiento
  tiie28: 'SF43783', // TIIE 28 días
  bono3: 'SF43883', // Bono M tasa fija 3 años – rendimiento en subasta primaria (semanal/rotativo)
  bono10: 'SF44071', // Bono M tasa fija 10 años – rendimiento en subasta primaria
};

// Encuesta de Banxico a especialistas del sector privado (mensual, MEDIANAS). IDs verificados en el SIE
// (cuadros CR154, CR155, CR163, CR168, CR171) el 18-nov-2026. La fecha de cada dato es el mes de la encuesta.
export const SIE_SURVEY = {
  infl12m: 'SR14195', // Inflación general próximos 12 meses
  // Tasa de fondeo al cierre del trimestre t … t+8 (t = trimestre de la encuesta)
  path: ['SR14659', 'SR14666', 'SR14673', 'SR14680', 'SR14687', 'SR14694', 'SR14701', 'SR14708', 'SR14715'],
};
// Tabla resumen: [id, etiqueta (año t = año de la encuesta), decimales]
export const SIE_EXPECTATIONS = [
  ['SR14139', 'Inflación general, cierre año t', 2],
  ['SR14146', 'Inflación general, cierre año t+1', 2],
  ['SR14167', 'Inflación subyacente, cierre año t', 2],
  ['SR14687', 'Tasa de fondeo, dentro de 4 trimestres', 2],
  ['SR14770', 'USD/MXN, cierre año t', 2],
  ['SR14777', 'USD/MXN, cierre año t+1', 2],
  ['SR14448', 'PIB real, año t', 2],
  ['SR14455', 'PIB real, año t+1', 2],
];

const TOKEN = () => {
  const t = process.env.BANXICO_TOKEN;
  if (!t) throw new Error('Falta BANXICO_TOKEN (gratis en banxico.org.mx/SieAPIRest)');
  return t;
};
const sieUrl = () => 'https://www.banxico.org.mx/SieAPIRest/service/v1/doc/catalogoSeries';

export function parseSie(j) {
  const out = {};
  for (const s of j?.bmx?.series || []) {
    out[s.idSerie] = clean(
      (s.datos || []).map((p) => ({ d: dmyToIso(p.fecha), v: parseFloat(String(p.dato).replace(/,/g, '')) }))
    );
  }
  return out;
}

export async function sie(ids, from) {
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${ids.join(',')}/datos/${iso(from)}/${iso(new Date())}`;
  return parseSie(await getJson(url, { headers: { 'Bmx-Token': TOKEN() } }));
}

export default async function mexico() {
  const errors = [];
  const d = await settle(
    {
      'Banxico SIE (tasas/FX)': () => sie([SIE.objetivo, SIE.fix, SIE.cetes28, SIE.tiie28, SIE.bono3, SIE.bono10], daysAgo(1100)),
      'Banxico SIE inflación': () => sie([SIE.inflacion], daysAgo(1100)),
      // Un solo request para toda la encuesta (el SIE limita la cantidad de consultas).
      'Banxico encuesta': () => sie([SIE_SURVEY.infl12m, ...SIE_SURVEY.path, ...SIE_EXPECTATIONS.map((e) => e[0])].filter((x, i, a) => a.indexOf(x) === i), daysAgo(800)),
      'Yahoo USD/MXN': () => yahooSeries('MXN=X'),
      'Yahoo EWW/^MXX': () => equityBlock('EWW', 'iShares MSCI Mexico (EWW, USD)', '^MXX', 'S&P/BMV IPC'),
    },
    errors
  );

  const s = d['Banxico SIE (tasas/FX)'] || {};
  const objetivo = s[SIE.objetivo] || [];
  const fix = s[SIE.fix] || [];
  const infl = (d['Banxico SIE inflación'] || {})[SIE.inflacion] || [];
  const cetes = s[SIE.cetes28] || [];
  const src = (id) => ({ source: `Banxico SIE ${id}`, url: sieUrl(id) });
  const fxSeries = fix.length ? fix : d['Yahoo USD/MXN'] || [];
  const sv = d['Banxico encuesta'] || {};
  const surveyUrl = 'https://www.banxico.org.mx/publicaciones-y-prensa/encuestas-sobre-las-expectativas-de-los-especialis/encuestas-expectativas-del-se.html';
  const svSrc = { source: 'Banxico SIE – Encuesta a especialistas (mediana)', url: surveyUrl };
  const asOf = last(sv[SIE_SURVEY.infl12m] || [])?.d;
  // Trayectoria esperada: fin de cada trimestre desde el trimestre de la última encuesta.
  let path = null;
  const pathPts = SIE_SURVEY.path.map((id, i) => {
    const p = last(sv[id] || []);
    if (!p || p.d !== asOf) return null;
    const q0 = new Date(asOf + 'T00:00:00Z');
    const qi = Math.floor(q0.getUTCMonth() / 3) + i;
    const y = q0.getUTCFullYear() + Math.floor(qi / 4);
    return { label: `${(qi % 4) + 1}T${String(y).slice(2)}`, rate: p.v };
  }).filter(Boolean);
  if (pathPts.length) {
    path = { title: 'Tasa de fondeo esperada al cierre de cada trimestre (Encuesta Banxico)', kind: 'survey', asOf, current: last(objetivo)?.v, currentLabel: 'Objetivo actual', path: pathPts, ...svSrc, note: 'Mediana de los especialistas del sector privado.' };
  }
  const expectations = asOf
    ? {
        title: 'Encuesta Banxico – especialistas (mediana)',
        columns: ['Variable', 'Última', 'Hace 3 meses'],
        rows: SIE_EXPECTATIONS.map(([id, label]) => {
          const ser = sv[id] || [];
          const prev = ser.find((p) => p.d === iso(new Date(Date.UTC(+asOf.slice(0, 4), +asOf.slice(5, 7) - 4, 1))));
          return [label.replace('año t+1', String(+asOf.slice(0, 4) + 1)).replace('año t', asOf.slice(0, 4)), last(ser)?.v ?? null, prev?.v ?? null];
        }),
        asOf,
        ...svSrc,
      }
    : null;
  const bono3 = s[SIE.bono3] || [];
  const bono10 = s[SIE.bono10] || [];

  return {
    id: 'mx',
    name: 'México',
    flag: '🇲🇽',
    currency: 'MXN',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Tasa objetivo', series: objetivo, changeDays: 365, ...src(SIE.objetivo) }),
      kpi({ key: 'tiie', group: 'policy', label: 'TIIE 28d', series: s[SIE.tiie28] || [], ...src(SIE.tiie28) }),
      kpi({ key: 'cetes', group: 'market', label: 'Cetes 28d', series: cetes, changeDays: 30, ...src(SIE.cetes28) }),
      kpi({ key: 'cpi', group: 'inflation', label: 'Inflación INPC a/a', series: infl, changeDays: 365, ...src(SIE.inflacion) }),
      kpi({
        key: 'fx',
        group: 'fx',
        label: fix.length ? 'USD/MXN (FIX)' : 'USD/MXN (Yahoo)',
        series: fxSeries,
        unit: '',
        decimals: 4,
        changeDays: 365,
        changeUnit: '%',
        ...(fix.length ? src(SIE.fix) : { source: 'Yahoo MXN=X', url: 'https://finance.yahoo.com/quote/MXN=X' }),
      }),
      kpi({ key: 'exp_rate', group: 'expectations', label: 'Tasa esperada en 4 trim. (Encuesta)', series: sv['SR14687'] || [], ...svSrc }),
      kpi({ key: 'exp_cpi', group: 'expectations', label: 'Inflación esperada 12m (Encuesta)', series: sv[SIE_SURVEY.infl12m] || [], ...svSrc }),
      kpi({ key: 'y2', group: 'market', label: 'Bono M 3Y (subasta)', series: bono3, changeDays: 365, note: 'Rendimiento en la última subasta primaria', ...src(SIE.bono3) }),
      kpi({ key: 'y10', group: 'market', label: 'Bono M 10Y (subasta)', series: bono10, changeDays: 365, note: 'Rendimiento en la última subasta primaria', ...src(SIE.bono10) }),
    ],
    equity: d['Yahoo EWW/^MXX'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Tasa objetivo vs inflación INPC',
        unit: '%',
        lines: [
          { key: 'obj', label: 'Tasa objetivo', step: true },
          { key: 'infl', label: 'INPC a/a' },
        ],
        data: merge({ obj: thin(objetivo.filter((p) => p.d >= (infl[0]?.d || ''))), infl }),
      },
      { id: 'curve', title: 'Bonos M en subasta: 3Y y 10Y', unit: '%', lines: [{ key: 'b3', label: '3Y', step: true }, { key: 'b10', label: '10Y', step: true }], data: merge({ b3: bono3.filter((p) => p.d >= iso(daysAgo(800))), b10: bono10.filter((p) => p.d >= iso(daysAgo(800))) }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: 'Tasa objetivo vs esperada en 4 trimestres (Encuesta)',
        unit: '%',
        lines: [{ key: 'obj', label: 'Objetivo', step: true }, { key: 'exp', label: 'Esperada +4T' }],
        data: merge({ obj: thin(objetivo.filter((p) => p.d >= iso(daysAgo(800)))), exp: sv['SR14687'] || [] }),
      },
      {
        id: 'exp-cpi',
        group: 'exp',
        title: 'Inflación observada vs esperada 12m (Encuesta)',
        unit: '%',
        lines: [{ key: 'infl', label: 'INPC a/a' }, { key: 'exp', label: 'Esperada 12m' }],
        data: merge({ infl: infl.filter((p) => p.d >= iso(daysAgo(800))), exp: sv[SIE_SURVEY.infl12m] || [] }),
      },
      { id: 'fx', title: 'USD/MXN', unit: '', lines: [{ key: 'v', label: 'USD/MXN' }], data: merge({ v: thin(fxSeries.filter((p) => p.d >= iso(daysAgo(380)))) }) },
    ],
    expectations: expectations ? [expectations] : [],
    path,
    calendar: upcoming(meetingEvents('mx')),
    errors,
  };
}
