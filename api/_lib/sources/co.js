// Colombia: Banco de la República (Suameca, sin clave) + datos.gov.co (TRM) + Yahoo.
//
// Suameca (API REST pública del BanRep, ver suameca.js) trae cada serie con toda la historia por id (consultaInformacionSerie).
// Ids confirmados contra la API (27-nov-2026) en SUA. El SDMX de totoro.banrep.gov.co ("Sitio en Mantenimiento" desde nov-2026)
// ya no se usa. Expectativas: Encuesta mensual de analistas económicos (EME, eme.js).
import { getText, getJson, clean, iso, daysAgo, settle, kpi, merge, thin, last, upcoming } from '../util.js';
import { equityBlock } from '../yahoo.js';
import { agendaEvents } from '../calendar.js';
import { suameca, SUAMECA_PAGE } from '../suameca.js';
import { emeHistory, EME_PAGE } from '../eme.js';

/** Series de Suameca (consultaInformacionSerie?idSerie=). */
export const SUA = {
  policy: 59, // Tasa de política monetaria (diaria, efectiva anual)
  ibrOn: 241, // IBR overnight, nominal
  ibr3m: 243, // IBR a 3 meses, nominal
  cpi: 15270, // Inflación total anual (DANE), mensual
  target: 853, // Meta de inflación
  uvr: 850, // Unidad de Valor Real (diaria, publicada con ~1 mes de adelanto)
  trm: 1, // TRM
  tesPesos: [15272, 15273, 15274], // cero cupón TES en pesos 1, 5 y 10 años (Nelson-Siegel, diaria, carga semanal)
  tesUvr: [15275, 15276, 15277], // cero cupón TES UVR (tasa real) 1, 5 y 10 años
};
const PAGE = {
  policy: SUAMECA_PAGE(59, 'tasas_interes_politica_monetaria'),
  ibr: SUAMECA_PAGE(241, 'tasas_interes_indicador_bancario_referencia_ibr'),
  cpi: SUAMECA_PAGE(100001, 'inflacion_y_meta'),
  tes: SUAMECA_PAGE(640001, 'deuda_publica_tasas_cero_cupon_tes'),
  trm: SUAMECA_PAGE(1, 'tasa_cambio_peso_colombiano_trm_dolar_usd'),
};

/** IBR nominal (base 360, vencida) → efectiva anual, para compararla con la tasa de política. `days`: 1 (overnight), 30, 90. */
export const ibrEffective = (s, days) => s.map((p) => ({ d: p.d, v: Math.round(((1 + (p.v / 100) * days / 360) ** (360 / days) - 1) * 1e5) / 1e3 }));

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

// ---------- TRM (datos.gov.co, Socrata) ----------
async function trmSocrata(from) {
  const q = `$select=valor,vigenciadesde&$where=vigenciadesde>='${iso(from)}T00:00:00'&$order=vigenciadesde ASC&$limit=5000`;
  const j = await getJson(`https://www.datos.gov.co/resource/32sa-8pi3.json?${encodeURI(q)}`);
  return clean(j.map((r) => ({ d: r.vigenciadesde.slice(0, 10), v: parseFloat(r.valor) })));
}

export default async function colombia() {
  const errors = [];
  const from = daysAgo(400);
  const since = (yrs) => iso(daysAgo(Math.round(365.25 * yrs)));
  // Suameca repite la tasa de política hacia adelante (fechas futuras): se corta en hoy.
  const sua = (id, yrs, upTo = iso(new Date())) => suameca(id).then((r) => r.series.filter((p) => p.d >= since(yrs) && p.d <= upTo));
  const d = await settle(
    {
      'datos.gov.co TRM': () => trmSocrata(from),
      'DANE calendario': () => daneCalendar(),
      'BanRep tasa de política (Suameca)': () => sua(SUA.policy, 6),
      'BanRep IBR (Suameca)': async () => { const [on, m3] = await Promise.all([sua(SUA.ibrOn, 1.2), sua(SUA.ibr3m, 1.2)]); return { on, m3 }; },
      'BanRep inflación anual (Suameca)': () => sua(SUA.cpi, 6),
      'BanRep meta de inflación (Suameca)': () => sua(SUA.target, 6, '9999'), // la meta del año viene fechada el 31-dic
      // Curva cero cupón de TES (Nelson-Siegel sobre operaciones del SEN y el MEC), diaria. El BanRep la carga una vez por semana (~1 semana de atraso).
      'BanRep TES cero cupón (Suameca)': async () => {
        const [p1, p5, p10, u1, u5, u10] = await Promise.all([...SUA.tesPesos, ...SUA.tesUvr].map((id) => sua(id, 3)));
        return { p1, p5, p10, u1, u5, u10 };
      },
      'BanRep EME (encuesta de analistas)': () => emeHistory(),
      // GXG pasó a llamarse COLO. ICOLCAP.CL es la cotización en la BVC (Yahoo usa el sufijo .CL para Colombia).
      'Yahoo COLO/COLCAP': () => equityBlock('COLO', 'Global X MSCI Colombia (COLO, USD)', 'ICOLCAP.CL', 'iShares MSCI COLCAP (ICOLCAP)'),
    },
    errors
  );

  // TRM: datos.gov.co; si falla, Suameca.
  let trm = d['datos.gov.co TRM'] || [];
  let trmSrc = { source: 'datos.gov.co 32sa-8pi3 (TRM)', url: 'https://www.datos.gov.co/Econom-a-y-Finanzas/Tasa-de-Cambio-Representativa-del-Mercado-TRM/32sa-8pi3' };
  if (!trm.length) {
    try {
      trm = (await suameca(SUA.trm)).series.filter((p) => p.d >= iso(from));
      trmSrc = { source: `BanRep Suameca (serie ${SUA.trm}, TRM)`, url: PAGE.trm };
    } catch (e) {
      errors.push({ source: 'BanRep TRM (respaldo)', message: e.message });
    }
  }

  const policy = d['BanRep tasa de política (Suameca)'] || [];
  const cpi = d['BanRep inflación anual (Suameca)'] || [];
  const target = d['BanRep meta de inflación (Suameca)'] || [];
  const ibr = d['BanRep IBR (Suameca)'] || { on: [], m3: [] };
  const ibr3 = ibrEffective(ibr.m3, 90);
  const tes = d['BanRep TES cero cupón (Suameca)'] || { p1: [], p5: [], p10: [], u1: [], u5: [], u10: [] };
  // TES 2Y: interpolación lineal entre el 1Y y el 5Y (la curva del BanRep no publica el nodo de 2 años).
  const m5 = new Map(tes.p5.map((p) => [p.d, p.v]));
  const tes2 = tes.p1.filter((p) => m5.has(p.d)).map((p) => ({ d: p.d, v: Math.round((p.v + (m5.get(p.d) - p.v) / 4) * 1000) / 1000 }));
  // Compensación inflacionaria 10Y: (1 + pesos) / (1 + UVR) − 1.
  const mu = new Map(tes.u10.map((p) => [p.d, p.v]));
  const be10 = tes.p10.filter((p) => mu.has(p.d)).map((p) => ({ d: p.d, v: Math.round(((1 + p.v / 100) / (1 + mu.get(p.d) / 100) - 1) * 1e5) / 1e3 }));
  const eme = d['BanRep EME (encuesta de analistas)'];
  const ss = (id) => ({ source: `BanRep Suameca (serie ${id})`, url: PAGE.policy });
  const tesSrc = { source: 'BanRep Suameca, curva cero cupón TES', url: PAGE.tes };
  const tesNote = 'Curva cero cupón diaria del BanRep; se carga una vez por semana (~1 semana de atraso)';
  const emeSrc = { source: 'BanRep – Encuesta mensual de expectativas de analistas (EME)', url: EME_PAGE };
  const cut = (s, yrs) => s.filter((p) => p.d >= since(yrs));

  // Trayectoria esperada de la tasa (mediana EME, t … t+24 meses; t = mes de la encuesta).
  let path = null;
  if (eme) {
    const t0 = new Date(`${eme.asOf.slice(0, 7)}-01T00:00:00Z`);
    const pts = eme.tpm.map((s, k) => {
      const p = s?.find((x) => x.d === eme.asOf);
      if (!p) return null;
      const m = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() + k, 1));
      return { label: iso(m).slice(0, 7), rate: p.v };
    }).filter(Boolean);
    if (pts.length) path = { title: 'Tasa de política esperada por mes (EME)', kind: 'survey', asOf: eme.asOf, current: last(policy)?.v, currentLabel: 'Tasa actual', path: pts, ...emeSrc,
      note: 'Mediana de los analistas: tasa que esperan al final de cada mes, desde el mes de la encuesta.' };
  }
  const surveyMonth = eme ? Number(eme.asOf.slice(5, 7)) : 12;
  const lastOf = (s) => s?.find((p) => p.d === eme?.asOf)?.v ?? null;
  const expectations = eme
    ? [{
        title: 'Encuesta mensual de expectativas (EME) – mediana',
        columns: ['Variable', 'Mes en curso', 'Dic. este año', '12 meses', 'Dic. año próximo', '24 meses'],
        rows: [
          ['Inflación total (%)', lastOf(eme.infl.mom), lastOf(eme.infl.decCur), lastOf(eme.infl.m12), lastOf(eme.infl.decNext), lastOf(eme.infl.m24)],
          // t = mes de la encuesta (m): diciembre de este año es t+(12−m) y el del próximo, t+(24−m).
          ['Tasa de política (%)', lastOf(eme.tpm[0]), lastOf(eme.tpm[12 - surveyMonth]), lastOf(eme.tpm[12]), lastOf(eme.tpm[24 - surveyMonth]), lastOf(eme.tpm[24])],
          ['TRM fin de período (USDCOP)', lastOf(eme.trm.eom), lastOf(eme.trm.decCur), lastOf(eme.trm.m12), lastOf(eme.trm.decNext), lastOf(eme.trm.m24)],
        ],
        asOf: eme.asOf,
        ...emeSrc,
      }]
    : [];

  return {
    id: 'co',
    name: 'Colombia',
    flag: '🇨🇴',
    currency: 'COP',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Tasa de política (BanRep)', series: policy, changeDays: 365, ...ss(SUA.policy) }),
      kpi({ key: 'ibr_on', group: 'policy', label: 'IBR overnight (nominal)', series: ibr.on, decimals: 3, source: `BanRep Suameca (serie ${SUA.ibrOn})`, url: PAGE.ibr }),
      kpi({ key: 'cpi', group: 'inflation', label: 'IPC a/a', series: cpi, changeDays: 365, source: `BanRep Suameca (serie ${SUA.cpi}, DANE)`, url: PAGE.cpi }),
      kpi({ key: 'target', group: 'inflation', label: 'Meta de inflación', series: target, source: `BanRep Suameca (serie ${SUA.target})`, url: PAGE.cpi }),
      kpi({ key: 'exp_cpi', group: 'expectations', label: 'Inflación esperada a 12 meses (EME)', series: eme?.infl.m12 || [], ...emeSrc, note: 'Mediana de los analistas' }),
      kpi({ key: 'exp_cpi_dec', group: 'expectations', label: 'Inflación esperada a dic. del año próximo (EME)', series: eme?.infl.decNext || [], ...emeSrc }),
      kpi({ key: 'exp_rate', group: 'expectations', label: 'Tasa de política esperada en 12 meses (EME)', series: eme?.tpm[12] || [], ...emeSrc, note: 'Mediana de los analistas' }),
      kpi({ key: 'exp_fx', group: 'expectations', label: 'TRM esperada en 12 meses (EME)', series: eme?.trm.m12 || [], unit: '', decimals: 0, ...emeSrc }),
      kpi({ key: 'be10', group: 'expectations', label: 'Inflación implícita 10Y (TES pesos − UVR)', series: be10, note: 'Compensación inflacionaria: (1 + TES pesos) / (1 + TES UVR) − 1, curvas cero cupón', source: `Cálculo propio (${tesSrc.source})`, url: tesSrc.url }),
      kpi({ key: 'ibr3', group: 'market', label: 'IBR 3M (efectiva anual)', series: ibr3, decimals: 3, note: 'Convertida de la nominal publicada a efectiva anual, como la tasa de política', source: `Cálculo propio (BanRep Suameca, serie ${SUA.ibr3m})`, url: PAGE.ibr }),
      kpi({ key: 'y2', group: 'market', label: 'TES 2Y (cero cupón)', series: tes2, changeDays: 365, note: 'Interpolado entre TES 1Y y 5Y', source: `Cálculo propio (${tesSrc.source})`, url: tesSrc.url }),
      kpi({ key: 'y10', group: 'market', label: 'TES 10Y (cero cupón)', series: tes.p10, changeDays: 365, ...tesSrc, note: tesNote }),
      kpi({ key: 'r10', group: 'market', label: 'TES UVR 10Y (tasa real)', series: tes.u10, changeDays: 365, ...tesSrc, note: tesNote }),
      kpi({ key: 'fx', group: 'fx', label: 'USDCOP (TRM)', series: trm, unit: '', decimals: 2, changeDays: 365, ...trmSrc }),
    ],
    equity: d['Yahoo COLO/COLCAP'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Tasa de política, IPC a/a y meta',
        unit: '%',
        lines: [
          { key: 'pol', label: 'Tasa de política', step: true },
          { key: 'cpi', label: 'IPC a/a' },
          { key: 'meta', label: 'Meta', step: true },
        ],
        data: merge({ pol: thin(policy.filter((p) => p.d >= (cpi[0]?.d || ''))), cpi, meta: target.filter((p) => p.d >= (cpi[0]?.d || '') && p.d <= iso(new Date())) }),
      },
      { id: 'fx', title: 'USDCOP – TRM', unit: '', lines: [{ key: 'v', label: 'TRM' }], data: merge({ v: trm }) },
      {
        id: 'tes-pesos',
        title: 'TES cero cupón en pesos (1, 5 y 10 años)',
        unit: '%',
        lines: [{ key: 'y1', label: '1 año' }, { key: 'y5', label: '5 años' }, { key: 'y10', label: '10 años' }],
        data: merge({ y1: thin(tes.p1), y5: thin(tes.p5), y10: thin(tes.p10) }),
      },
      {
        id: 'tes-uvr',
        title: 'TES UVR cero cupón, tasa real (1, 5 y 10 años)',
        unit: '%',
        lines: [{ key: 'y1', label: '1 año' }, { key: 'y5', label: '5 años' }, { key: 'y10', label: '10 años' }],
        data: merge({ y1: thin(tes.u1), y5: thin(tes.u5), y10: thin(tes.u10) }),
      },
      {
        id: 'exp-cpi',
        group: 'exp',
        title: 'Inflación observada y esperada (EME, mediana)',
        unit: '%',
        lines: [{ key: 'cpi', label: 'IPC a/a' }, { key: 'm12', label: 'Esperada a 12 meses' }, { key: 'm24', label: 'Esperada a 24 meses' }],
        data: merge({ cpi: cut(cpi, 4), m12: cut(eme?.infl.m12 || [], 4), m24: cut(eme?.infl.m24 || [], 4) }),
      },
      {
        id: 'exp-rate',
        group: 'exp',
        title: 'Tasa de política: actual y esperada en 12 meses (EME)',
        unit: '%',
        lines: [{ key: 'pol', label: 'Tasa de política', step: true }, { key: 'e12', label: 'Esperada en 12 meses' }],
        data: merge({ pol: thin(cut(policy, 4)), e12: cut(eme?.tpm[12] || [], 4) }),
      },
      {
        id: 'exp-be',
        group: 'exp',
        title: 'Inflación implícita 10Y (TES pesos vs UVR)',
        unit: '%',
        lines: [{ key: 'be', label: 'Implícita 10Y' }],
        data: merge({ be: thin(be10) }),
      },
      {
        id: 'exp-ibr',
        group: 'exp',
        title: 'Tasa de política vs IBR 3M (lo que descuenta el mercado)',
        unit: '%',
        lines: [{ key: 'pol', label: 'Tasa de política', step: true }, { key: 'ibr3', label: 'IBR 3M (efectiva)' }],
        data: merge({ pol: policy.filter((p) => p.d >= (ibr3[0]?.d || '')), ibr3 }),
      },
    ],
    expectations,
    path,
    calendar: upcoming(
      [...agendaEvents('co'), ...(d['DANE calendario'] || [])].filter((e, i, a) => a.findIndex((x) => x.date === e.date && x.event.startsWith(e.event.split(' de ')[0])) === i),
      20
    ),
    errors,
  };
}
