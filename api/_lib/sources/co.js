// Colombia: Banco de la República (SDMX, sin clave) + datos.gov.co (TRM) + FRED (IPC fallback) + Yahoo.
//
// BanRep expone SDMX 2.1 en totoro.banrep.gov.co, SOLO en XML (JSON/CSV devuelven 406).
// Flujos verificados contra la API (18-nov-2026): DF_CBR_DAILY_HIST (tasa de política), DF_IBR_DAILY_HIST,
// DF_TRM_DAILY_HIST, DF_UVR_DAILY_HIST, DF_TES_MONTHLY_HIST. El catálogo NO tiene IPC: se deriva de la UVR
// (ver ipcFromUvr). La tasa de política se puede fijar con env BANREP_FLOW_POLICY.
import { getText, getJson, clean, iso, daysAgo, settle, kpi, merge, thin, last, upcoming, yoyFromIndex, spreadSeries } from '../util.js';
import { equityBlock } from '../yahoo.js';
import { agendaEvents } from '../calendar.js';
import { fred } from './us.js';

const SDMX = 'https://totoro.banrep.gov.co/nsi-jax-ws/rest';

// Calendario del DANE (vista mensual en HTML, sin API). Cada publicación es un link
// ".../icalrepeat.detail/AAAA/MM/DD/<id>/-/<slug>"><strong> Título</strong>. Se toman IPC, PIB e ISE.
const DANE_CAL = 'https://www.dane.gov.co/index.php/calendario';
const DANE_PICK = [
  [/^Índice de Precios al Consumidor \(IPC\)$/, 'DANE – IPC'],
  [/^Producto Interno Bruto/, 'DANE – PIB trimestral'],
  [/^Indicador de Seguimiento a la Economía/, 'DANE – ISE (actividad mensual)'],
];
export function parseDaneMonth(html) {
  const out = [];
  const re = /icalrepeat\.detail\/(\d{4})\/(\d{2})\/(\d{2})\/\d+\/[^"]*"[^>]*>\s*<strong>\s*([^<]+?)\s*<\/strong>/g;
  for (const m of html.matchAll(re)) {
    const hit = DANE_PICK.find(([r]) => r.test(m[4]));
    if (hit) out.push({ date: `${m[1]}-${m[2]}-${m[3]}`, event: hit[1], kind: 'data', url: DANE_CAL });
  }
  return out.filter((e, i, a) => a.findIndex((x) => x.date === e.date && x.event === e.event) === i);
}
async function daneCalendar(months = 4) {
  const now = new Date();
  const pages = await Promise.allSettled(
    Array.from({ length: months }, (_, k) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 15));
      return getText(`${DANE_CAL}/month.calendar/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/15/-`, { timeout: 20000 });
    })
  );
  const ok = pages.filter((p) => p.status === 'fulfilled');
  if (!ok.length) throw new Error(pages[0]?.reason?.message || 'DANE calendario sin respuesta');
  return ok.flatMap((p) => parseDaneMonth(p.value));
}
const XML_DATA = 'application/vnd.sdmx.genericdata+xml;version=2.1';
const XML_STRUCT = 'application/vnd.sdmx.structure+xml;version=2.1';
const BANREP_URL = 'https://suameca.banrep.gov.co/estadisticas-economicas/';

export const BANREP_FLOWS = {
  trm: 'DF_TRM_DAILY_HIST',
  ibr: 'DF_IBR_DAILY_HIST',
  uvr: 'DF_UVR_DAILY_HIST',
  tes: 'DF_TES_MONTHLY_HIST',
  policy: process.env.BANREP_FLOW_POLICY || 'DF_CBR_DAILY_HIST',
};

// Cómo elegir la serie dentro de un flujo que trae varias (la clave SDMX concatenada con '.').
// Claves reales: CO.IRIBRM{00,01,03,06}._Z._Z._Z.{ER,NR}.D (plazo en meses; ER = efectiva anual, NR = nominal).
// Se usa ER porque la tasa de política de BanRep se expresa en efectiva anual (IBR ON ER ≈ tasa de política).
export const SERIES_PICK = {
  ibrOvernight: process.env.BANREP_IBR_ON || /(^|\.)IRIBRM00\..*\.ER(\.|$)/,
  ibr6m: process.env.BANREP_IBR_6M || /(^|\.)IRIBRM06\..*\.ER(\.|$)/,
  tes10: /(^|\.)IRGBRY10\./, // TES tasa fija 10 años, promedio mensual (viene en decimal)
  tes1: /(^|\.)IRGBRY01\./,
  tes5: /(^|\.)IRGBRY05\./,
  uvr: /\.CRVU\./, // nivel de la UVR (la otra serie, APC, es su variación)
};

/**
 * IPC a/a desde la UVR. Por fórmula (Ley 546/1999), la UVR entre el día 16 del mes t y el 15 del mes t+1
 * crece a la variación mensual del IPC del mes t-1. Entonces el IPC a/a del mes M es
 * UVR(15 de M+2) / UVR(15 de M-10) − 1. Contrastado con el DANE para ene–oct 2025: coincide al centésimo.
 */
export function ipcFromUvr(uvr) {
  const m = new Map(uvr.map((p) => [p.d, p.v]));
  const at = (y, mo) => m.get(iso(new Date(Date.UTC(y, mo, 15))));
  const first = uvr[0]?.d, lastD = uvr[uvr.length - 1]?.d;
  if (!first) return [];
  const out = [];
  for (let y = +first.slice(0, 4), mo = 0; ; mo++) {
    const dm = new Date(Date.UTC(y, mo, 1));
    if (iso(dm) > lastD) break;
    const a = at(dm.getUTCFullYear(), dm.getUTCMonth() + 2), b = at(dm.getUTCFullYear(), dm.getUTCMonth() - 10);
    if (a && b) out.push({ d: iso(dm), v: Math.round((a / b - 1) * 10000) / 100 });
  }
  return clean(out);
}

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
      'DANE calendario': () => daneCalendar(),
      'BanRep IBR': () => banrep(BANREP_FLOWS.ibr, year - 1),
      'BanRep tasa de política': async () => {
        const flow = BANREP_FLOWS.policy;
        const all = await banrep(flow, year - 3);
        return { flow, s: all.sort((a, b) => b.series.length - a.series.length)[0].series };
      },
      'BanRep IPC (vía UVR)': async () => ipcFromUvr(pick(await banrep(BANREP_FLOWS.uvr, year - 4), SERIES_PICK.uvr, 'UVR').series),
      'BanRep TES': async () => {
        const all = await banrep(BANREP_FLOWS.tes, year - 2);
        const pct = (re, label) => pick(all, re, label).series.map((p) => ({ d: p.d, v: p.v < 1 ? p.v * 100 : p.v })); // decimal → %
        return { y1: pct(SERIES_PICK.tes1, 'TES 1Y'), y5: pct(SERIES_PICK.tes5, 'TES 5Y'), y10: pct(SERIES_PICK.tes10, 'TES 10Y') };
      },
      // GXG pasó a llamarse COLO. ICOLCAP.CL es la cotización en la BVC (Yahoo usa el sufijo .CL para Colombia).
      'Yahoo COLO/COLCAP': () => equityBlock('COLO', 'Global X MSCI Colombia (COLO, USD)', 'ICOLCAP.CL', 'iShares MSCI COLCAP (ICOLCAP)'),
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
  const cpiB = d['BanRep IPC (vía UVR)'] || [];
  let cpiF = [];
  if (!cpiB.length) {
    try {
      cpiF = yoyFromIndex(await fred('COLCPIALLMINMEI', daysAgo(1500)));
    } catch (e) {
      errors.push({ source: 'FRED IPC Colombia (fallback)', message: e.message });
    }
  }
  // UVR (BanRep) es la fuente preferida; FRED/OCDE sólo si falla (viene con más rezago).
  const cpi = cpiB.length ? cpiB : cpiF;
  const cpiSrc = cpiB.length
    ? { source: `Cálculo propio (BanRep ${BANREP_FLOWS.uvr})`, url: BANREP_URL, note: 'IPC a/a derivado de la UVR (coincide con DANE)' }
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
  // TES 2Y: interpolación lineal entre el 1Y y el 5Y (BanRep no publica el nodo de 2 años).
  const tes = d['BanRep TES'] || { y1: [], y5: [], y10: [] };
  const tes2 = tes.y1.map((p) => {
    const q = tes.y5.find((x) => x.d === p.d);
    return q ? { d: p.d, v: p.v + (q.v - p.v) / 4 } : null;
  }).filter(Boolean);
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
      // Encuesta mensual de BanRep (EME): sin fuente automatizable (la página tiene captcha). Ver CLAUDE.md.
      kpi({ key: 'ibr6', group: 'market', label: 'IBR 6M', series: ibr6, decimals: 3, ...bsrc(BANREP_FLOWS.ibr) }),
      kpi({ key: 'y2', group: 'market', label: 'TES 2Y (prom. mensual)', series: tes2, changeDays: 365, note: 'Interpolado entre TES 1Y y 5Y', source: `Cálculo propio (BanRep ${BANREP_FLOWS.tes})`, url: BANREP_URL }),
      kpi({ key: 'y10', group: 'market', label: 'TES 10Y (prom. mensual)', series: tes.y10, changeDays: 365, ...bsrc(BANREP_FLOWS.tes) }),
      kpi({ key: 'fx', group: 'fx', label: 'USDCOP (TRM)', series: trm, unit: '', decimals: 2, changeDays: 365, ...trmSrc }),
    ],
    equity: d['Yahoo COLO/COLCAP'],
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
      { id: 'fx', title: 'USDCOP – TRM', unit: '', lines: [{ key: 'v', label: 'TRM' }], data: merge({ v: trm }) },
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
    calendar: upcoming(
      [...agendaEvents('co'), ...(d['DANE calendario'] || [])].filter((e, i, a) => a.findIndex((x) => x.date === e.date && x.event.startsWith(e.event.split(' de ')[0])) === i),
      20
    ),
    errors,
  };
}
