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
};
// Encuesta de Expectativas de Banxico: completar con los IDs del SIE
// (Encuestas > Encuesta sobre las expectativas de los especialistas). Ej:
// { id: 'SR14xxx', label: 'Inflación general cierre 2026' }
export const SIE_EXPECTATIONS = [];

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
      'Banxico SIE (tasas/FX)': () => sie([SIE.objetivo, SIE.fix, SIE.cetes28, SIE.tiie28], daysAgo(1100)),
      'Banxico SIE inflación': () => sie([SIE.inflacion], daysAgo(1100)),
      'Banxico encuesta': async () => {
        if (!SIE_EXPECTATIONS.length) return null;
        const r = await sie(SIE_EXPECTATIONS.map((e) => e.id), daysAgo(120));
        return {
          title: 'Encuesta Banxico – especialistas (media)',
          columns: ['Variable', 'Último'],
          rows: SIE_EXPECTATIONS.map((e) => [e.label, last(r[e.id] || [])?.v ?? null]),
          source: 'Banxico SIE',
          url: 'https://www.banxico.org.mx/publicaciones-y-prensa/encuestas-sobre-las-expectativas-de-los-especialistas-en-economia-del-sector-privado.html',
        };
      },
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
  const expectations = d['Banxico encuesta'];

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
      { key: 'exp_rate', group: 'expectations', label: 'Tasa esperada (Encuesta Banxico)', value: null, note: 'Completar IDs SIE de la encuesta. Ver CLAUDE.md.', source: 'Pendiente' },
      { key: 'mbono', group: 'market', label: 'Mbono 10Y (mercado)', value: null, note: 'Agregar ID SIE del vector de bonos M. Ver README.', source: 'Pendiente' },
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
      { id: 'fx', title: 'USD/MXN', unit: '', lines: [{ key: 'v', label: 'USD/MXN' }], data: merge({ v: thin(fxSeries.filter((p) => p.d >= iso(daysAgo(380)))) }) },
    ],
    expectations: expectations ? [expectations] : [],
    path: null,
    calendar: upcoming(meetingEvents('mx')),
    errors,
  };
}
