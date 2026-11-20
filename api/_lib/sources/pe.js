// Perú: BIS (tasa de referencia del BCRP e IPC), BCRD (EMBI), FMI WEO (proyecciones) y Yahoo (PEN, EPU, S&P/BVL).
// La API de series del BCRP (estadisticas.bcrp.gob.pe) responde con un desafío anti-bots a consultas automáticas
// (verificado el 19-nov-2026): no se usa. Por eso no hay curva soberana en soles ni encuesta de expectativas del BCRP.
import { settle, kpi, merge, thin, daysAgo, iso, upcoming } from '../util.js';
import { equityBlock, yahooSeries } from '../yahoo.js';
import { agendaEvents } from '../calendar.js';
import { bis, BIS_URL } from '../bis.js';
import { embi, EMBI_PAGE } from './usd.js';
import { weoOutlook } from './sust.js';

const BCRP_URL = 'https://www.bcrp.gob.pe/politica-monetaria.html';

/** EMBI (serie en pb) → KPI en pb. Se pasa por kpi() en % para que las variaciones salgan en pb, como en Argentina. */
export function embiKpi(series, label = 'Spread soberano (EMBI)') {
  const k = kpi({ key: 'embi', group: 'market', label, series: series.map((p) => ({ d: p.d, v: p.v / 100 })), changeDays: 30, source: 'J.P. Morgan EMBI vía BCRD', url: EMBI_PAGE });
  if (k.value != null) Object.assign(k, { value: k.value * 100, unit: ' pb', decimals: 0, spark: k.spark?.map((p) => ({ d: p.d, v: p.v * 100 })) });
  return k;
}

/** KPI de un único valor de proyección del FMI (sin historia: sin tendencia). */
export function weoKpi(W, note) {
  if (!W?.expCpi?.v && W?.expCpi?.v !== 0) return { key: 'exp_cpi', group: 'expectations', label: 'Inflación esperada (FMI)', value: null, source: 'Pendiente', note: 'FMI WEO no respondió' };
  return {
    key: 'exp_cpi', group: 'expectations', label: `Inflación esperada ${W.expCpi.label} (FMI)`, unit: '%', decimals: 1,
    value: W.expCpi.v, date: W.asOf, source: 'FMI, World Economic Outlook', url: W.url, note,
  };
}

export default async function peru() {
  const errors = [];
  const d = await settle(
    {
      'BIS tasa de referencia BCRP': () => bis('WS_CBPOL', 'D.PE', daysAgo(1100)),
      'BIS IPC Perú': () => bis('WS_LONG_CPI', 'M.PE.771', daysAgo(1200)),
      'BCRD EMBI': embi,
      'FMI WEO Perú': () => weoOutlook('PER'),
      'Yahoo USDPEN': () => yahooSeries('PEN=X'),
      'Yahoo EPU/S&P BVL': () => equityBlock('EPU', 'iShares MSCI Peru (EPU, USD)', '^SPBLPGPT', 'S&P/BVL Peru General'),
    },
    errors
  );
  const policy = d['BIS tasa de referencia BCRP'] || [];
  const cpi = d['BIS IPC Perú'] || [];
  const embiPe = d['BCRD EMBI']?.series?.pe || [];
  const W = d['FMI WEO Perú'];
  const fx = d['Yahoo USDPEN'] || [];
  const from3y = cpi[0]?.d || iso(daysAgo(1100));
  const pend = (key, group, label, note) => ({ key, group, label, value: null, source: 'Pendiente', note });
  const noBcrp = 'La API del BCRP bloquea consultas automáticas; pendiente de otra fuente (p.ej. LSEG)';

  return {
    id: 'pe',
    name: 'Perú',
    flag: '🇵🇪',
    currency: 'PEN',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Tasa de referencia BCRP', series: policy, decimals: 2, changeDays: 365, source: 'BIS WS_CBPOL (D.PE)', url: BIS_URL.cbpol }),
      kpi({ key: 'cpi', group: 'inflation', label: 'IPC a/a (Lima Metropolitana)', series: cpi, decimals: 1, changeDays: 365, note: 'Meta del BCRP: 2% ± 1 pp', source: 'BIS WS_LONG_CPI (M.PE.771)', url: BIS_URL.cpi }),
      weoKpi(W, 'Proyección diciembre contra diciembre del FMI (no hay encuesta del BCRP accesible por API)'),
      pend('exp_rate', 'expectations', 'Tasa esperada (encuesta BCRP)', noBcrp),
      pend('y2', 'market', 'Bono soberano en soles 2Y', noBcrp),
      embiKpi(embiPe),
      kpi({ key: 'fx', group: 'fx', label: 'USDPEN', series: fx, unit: '', decimals: 3, changeDays: 365, note: 'Soles por dólar', source: 'Yahoo PEN=X', url: 'https://finance.yahoo.com/quote/PEN=X' }),
    ],
    equity: d['Yahoo EPU/S&P BVL'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Tasa de referencia vs IPC a/a',
        unit: '%',
        lines: [{ key: 'pol', label: 'Tasa de referencia', step: true }, { key: 'cpi', label: 'IPC a/a' }],
        data: merge({ pol: thin(policy.filter((p) => p.d >= from3y)), cpi }),
      },
      { id: 'embi', title: 'Spread EMBI Perú (pb)', unit: ' pb', lines: [{ key: 'v', label: 'EMBI Perú' }], data: embiPe.filter((p) => p.d >= iso(daysAgo(800))) },
      { id: 'fx', title: 'USDPEN', unit: '', lines: [{ key: 'v', label: 'USDPEN' }], data: merge({ v: fx }) },
    ],
    expectations: W ? [W.table] : [],
    path: null,
    calendar: upcoming(agendaEvents('pe'), 20),
    errors,
  };
}
