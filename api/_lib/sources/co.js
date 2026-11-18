// Colombia: Banco de la República (SDMX, sin clave) + datos.gov.co (TRM) + FRED (IPC fallback) + Yahoo.
//
// BanRep expone SDMX 2.1 en totoro.banrep.gov.co, SOLO en XML (JSON/CSV devuelven 406).
// Flujos confirmados: DF_TRM_DAILY_HIST, DF_IBR_DAILY_HIST, DF_DTF_DAILY_HIST.
// La tasa de política y el IPC NO tienen ID confirmado: se descubren buscando en el catálogo
// de dataflows por nombre. Se pueden fijar con env BANREP_FLOW_POLICY / BANREP_FLOW_CPI.
import { getText, getJson, clean, iso, daysAgo, settle, kpi, merge, thin, last, upcoming, yoyFromIndex, spreadSeries } from '../util.js';
import { equityBlock } from '../yahoo.js';
import { meetingEvents } from '../calendar.js';
import { fred } from './us.js';

const SDMX = 'https://totoro.banrep.gov.co/nsi-jax-ws/rest';
const XML_DATA = 'application/vnd.sdmx.genericdata+xml;version=2.1';
const XML_STRUCT = 'application/vnd.sdmx.structure+xml;version=2.1';
const BANREP_URL = 'https://suameca.banrep.gov.co/estadisticas-economicas/';

export const BANREP_FLOWS = {
  trm: 'DF_TRM_DAILY_HIST',
  ibr: 'DF_IBR_DAILY_HIST',
  policy: process.env.BANREP_FLOW_POLICY || null, // se descubre si es null
  cpi: process.env.BANREP_FLOW_CPI || null, // se descubre si es null
};

// Cómo elegir la serie dentro de un flujo que trae varias (la clave SDMX concatenada con '.').
// Ajustar tras el primer `smoke`: el error lista las claves disponibles.
export const SERIES_PICK = {
  ibrOvernight: process.env.BANREP_IBR_ON || /(^|\.)(ON|O_N|OVERNIGHT|1D|D1)(\.|$)/i,
  ibr6m: process.env.BANREP_IBR_6M || /(^|\.)(6M|M6|180D?)(\.|$)/i,
};

// ---------- parser SDMX genericdata (XML) sin dependencias ----------
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

function normPeriod(p) {
  if (/^\d{8}$/.test(p)) return `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}`;
  if (/^\d{4}-\d{2}$/.test(p)) return `${p}-01`;
  return p.slice(0, 10);
}

/** Devuelve [{ key: 'A.B.C', dims: {id: value}, series: [{d,v}] }] */
export function parseSdmxGeneric(xml) {
  const out = [];
  const seriesRe = /<(?:\w+:)?Series\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Series>/g;
  let m;
  while ((m = seriesRe.exec(xml))) {
    const body = m[1];
    const keyBlock = body.match(/<(?:\w+:)?SeriesKey>([\s\S]*?)<\/(?:\w+:)?SeriesKey>/)?.[1] || '';
    const dims = {};
    for (const t of keyBlock.match(/<(?:\w+:)?Value\b[^>]*\/?>/g) || []) dims[attr(t, 'id')] = attr(t, 'value');
    const obs = [];
    for (const o of body.match(/<(?:\w+:)?Obs>[\s\S]*?<\/(?:\w+:)?Obs>/g) || []) {
      const dimTag = o.match(/<(?:\w+:)?ObsDimension\b[^>]*>/)?.[0];
      const valTag = o.match(/<(?:\w+:)?ObsValue\b[^>]*>/)?.[0];
      if (dimTag && valTag) obs.push({ d: normPeriod(attr(dimTag, 'value')), v: parseFloat(attr(valTag, 'value')) });
    }
    out.push({ key: Object.values(dims).join('.'), dims, series: clean(obs) });
  }
  return out;
}

/** Catálogo de dataflows: [{id, name}] */
export function parseDataflows(xml) {
  const out = [];
  const re = /<(?:\w+:)?Dataflow\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Dataflow>/g;
  let m;
  while ((m = re.exec(xml))) {
    const names = [...m[2].matchAll(/<(?:\w+:)?Name\b[^>]*>([^<]*)<\/(?:\w+:)?Name>/g)].map((x) => x[1]);
    out.push({ id: attr(m[1], 'id'), name: names.join(' | ') });
  }
  return out;
}

let flowCache = null;
async function dataflows() {
  if (!flowCache) flowCache = parseDataflows(await getText(`${SDMX}/dataflow/ESTAT/all/latest`, { headers: { Accept: XML_STRUCT } }));
  return flowCache;
}
async function findFlow(re, preferHist = true) {
  const flows = (await dataflows()).filter((f) => re.test(f.name) || re.test(f.id));
  if (!flows.length) throw new Error(`No hay dataflow BanRep que coincida con ${re}`);
  return (preferHist && flows.find((f) => /HIST/i.test(f.id))) || flows[0];
}

export async function banrep(flow, fromYear) {
  const xml = await getText(`${SDMX}/data/ESTAT,${flow},1.0/all/ALL/?startPeriod=${fromYear}`, { headers: { Accept: XML_DATA }, timeout: 25000 });
  const all = parseSdmxGeneric(xml);
  if (!all.length) throw new Error(`BanRep ${flow}: respuesta sin series`);
  return all;
}

/** Elige una serie de un flujo: por regex sobre la clave, o la única/la más larga. */
function pick(all, re, label) {
  if (all.length === 1) return all[0];
  const rx = typeof re === 'string' ? new RegExp(re) : re;
  const hit = rx && all.find((s) => rx.test(s.key));
  if (hit) return hit;
  throw new Error(`${label}: ${all.length} series y ninguna coincide con ${rx}. Claves: ${all.map((s) => s.key).join(', ')}`);
}

// ---------- TRM (datos.gov.co, Socrata) ----------
async function trmSocrata(from) {
  const q = `$select=valor,vigenciadesde&$where=vigenciadesde>='${iso(from)}T00:00:00'&$order=vigenciadesde ASC&$limit=5000`;
  const j = await getJson(`https://www.datos.gov.co/resource/32sa-8pi3.json?${encodeURI(q)}`);
  return clean(j.map((r) => ({ d: r.vigenciadesde.slice(0, 10), v: parseFloat(r.valor) })));
}

export default async function colombia() {
  const errors = [];
  const year = new Date().getUTCFullYear();
  const from = daysAgo(400);
  const d = await settle(
    {
      'datos.gov.co TRM': () => trmSocrata(from),
      'BanRep IBR': () => banrep(BANREP_FLOWS.ibr, year - 1),
      'BanRep tasa de política': async () => {
        const flow = BANREP_FLOWS.policy || (await findFlow(/pol[ií]tica monetaria|intervenci[oó]n|policy rate|CBR/i)).id;
        const all = await banrep(flow, year - 3);
        return { flow, s: all.sort((a, b) => b.series.length - a.series.length)[0].series };
      },
      'BanRep IPC': async () => {
        const flow = BANREP_FLOWS.cpi || (await findFlow(/precios al consumidor|IPC|inflaci[oó]n|CPI/i)).id;
        const all = await banrep(flow, year - 4);
        // Preferir la serie de variación anual si se identifica por la clave; si no, la más larga.
        const anual = all.find((x) => /ANU|ANNUAL|YOY|VAR_?A/i.test(x.key));
        const s = (anual || all.sort((a, b) => b.series.length - a.series.length)[0]).series;
        // Un índice (≈100+) se convierte a variación a/a; una tasa (<50) se usa tal cual.
        return { flow, s: last(s)?.v > 50 ? yoyFromIndex(s) : s };
      },
      'Yahoo GXG/COLCAP': () => equityBlock('GXG', 'Global X MSCI Colombia (GXG, USD)', 'ICOLCAP.CL', 'iShares MSCI COLCAP (ICOLCAP)'),
    },
    errors
  );

  // TRM: datos.gov.co; si falla, BanRep SDMX.
  let trm = d['datos.gov.co TRM'] || [];
  let trmSrc = { source: 'datos.gov.co 32sa-8pi3 (TRM)', url: 'https://www.datos.gov.co/Econom-a-y-Finanzas/Tasa-de-Cambio-Representativa-del-Mercado-TRM/32sa-8pi3' };
  if (!trm.length) {
    try {
      trm = pick(await banrep(BANREP_FLOWS.trm, year - 1), null, 'TRM').series.filter((p) => p.d >= iso(from));
      trmSrc = { source: `BanRep SDMX ${BANREP_FLOWS.trm}`, url: BANREP_URL };
    } catch (e) {
      errors.push({ source: 'BanRep TRM (fallback)', message: e.message });
    }
  }

  const pol = d['BanRep tasa de política'];
  const policy = pol?.s || [];
  const cpiB = d['BanRep IPC'];
  let cpiF = [];
  if (!cpiB?.s?.length) {
    try {
      cpiF = yoyFromIndex(await fred('COLCPIALLMINMEI', daysAgo(1500)));
    } catch (e) {
      errors.push({ source: 'FRED IPC Colombia (fallback)', message: e.message });
    }
  }
  // BanRep es la fuente preferida; FRED/OCDE sólo si BanRep no trae IPC (suele venir con rezago).
  const cpi = cpiB?.s?.length ? cpiB.s : cpiF;
  const cpiSrc = cpiB?.s?.length
    ? { source: `BanRep SDMX ${cpiB.flow}`, url: BANREP_URL }
    : { source: 'FRED COLCPIALLMINMEI (OCDE, calc. a/a)', url: 'https://fred.stlouisfed.org/series/COLCPIALLMINMEI' };

  let ibrOn = [], ibr6 = [];
  const ibrAll = d['BanRep IBR'];
  if (ibrAll) {
    for (const [k, re, label] of [['on', SERIES_PICK.ibrOvernight, 'IBR overnight'], ['m6', SERIES_PICK.ibr6m, 'IBR 6M']]) {
      try {
        const s = pick(ibrAll, re, label).series.filter((p) => p.d >= iso(from));
        if (k === 'on') ibrOn = s;
        else ibr6 = s;
      } catch (e) {
        errors.push({ source: `BanRep ${label}`, message: e.message });
      }
    }
  }
  const slope = spreadSeries(ibr6, policy);
  const bsrc = (flow) => ({ source: `BanRep SDMX ${flow}`, url: BANREP_URL });

  return {
    id: 'co',
    name: 'Colombia',
    flag: '🇨🇴',
    currency: 'COP',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Tasa de política (BanRep)', series: policy, changeDays: 365, ...bsrc(pol?.flow || 'tasa de política') }),
      kpi({ key: 'ibr_on', group: 'policy', label: 'IBR overnight', series: ibrOn, decimals: 3, ...bsrc(BANREP_FLOWS.ibr) }),
      kpi({ key: 'cpi', group: 'inflation', label: 'IPC a/a', series: cpi, changeDays: 365, ...cpiSrc }),
      kpi({ key: 'exp_rate', group: 'expectations', label: 'IBR 6M − tasa de política', series: slope, note: 'Proxy de mercado: >0 descuenta subas; <0, bajas', source: 'Cálculo propio (BanRep IBR)', url: BANREP_URL }),
      { key: 'exp_cpi', group: 'expectations', label: 'Inflación esperada (Encuesta BanRep)', value: null, note: 'Encuesta mensual de analistas: solo Excel. Ver CLAUDE.md.', source: 'Pendiente' },
      kpi({ key: 'ibr6', group: 'market', label: 'IBR 6M', series: ibr6, decimals: 3, ...bsrc(BANREP_FLOWS.ibr) }),
      { key: 'tes', group: 'market', label: 'TES 10Y (mercado)', value: null, note: 'Sin API gratuita confirmada. Ver CLAUDE.md.', source: 'Pendiente' },
      kpi({ key: 'fx', group: 'fx', label: 'USD/COP (TRM)', series: trm, unit: '', decimals: 2, changeDays: 365, ...trmSrc }),
    ],
    equity: d['Yahoo GXG/COLCAP'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Tasa de política vs IPC a/a',
        unit: '%',
        lines: [
          { key: 'pol', label: 'Tasa de política', step: true },
          { key: 'cpi', label: 'IPC a/a' },
        ],
        data: merge({ pol: thin(policy.filter((p) => p.d >= (cpi[0]?.d || ''))), cpi }),
      },
      { id: 'fx', title: 'USD/COP – TRM', unit: '', lines: [{ key: 'v', label: 'TRM' }], data: merge({ v: trm }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: 'Tasa de política vs IBR 6M (lo que descuenta el mercado)',
        unit: '%',
        lines: [
          { key: 'pol', label: 'Tasa de política', step: true },
          { key: 'ibr6', label: 'IBR 6M' },
        ],
        data: merge({ pol: policy.filter((p) => p.d >= iso(from)), ibr6 }),
      },
    ],
    expectations: [],
    path: null,
    calendar: upcoming(meetingEvents('co')),
    errors,
  };
}
