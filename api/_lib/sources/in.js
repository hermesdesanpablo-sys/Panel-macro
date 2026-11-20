// India: BIS (repo del RBI e IPC), FRED/OCDE (call, 3M interbancaria y bono 10Y, mensuales), FMI WEO (proyecciones) y Yahoo.
// El RBI no tiene API pública de series; la curva diaria de G-secs (CCIL/FBIL) tampoco: pendiente (p.ej. LSEG).
import { settle, kpi, merge, thin, daysAgo, iso, upcoming, spreadSeries } from '../util.js';
import { equityBlock, yahooSeries } from '../yahoo.js';
import { agendaEvents } from '../calendar.js';
import { bis, BIS_URL } from '../bis.js';
import { fred } from './us.js';
import { weoOutlook } from './sust.js';
import { weoKpi } from './pe.js';

const fredUrl = (id) => `https://fred.stlouisfed.org/series/${id}`;
export const IN_FRED = {
  call: 'IRSTCI01INM156N', // call money/interbancaria a 1 día, promedio mensual (OCDE)
  m3: 'INDIR3TIB01STM', // tasa interbancaria a 3 meses, mensual (OCDE)
  y10: 'INDIRLTLT01STM', // bono del gobierno a 10 años, mensual (OCDE)
};

export default async function india() {
  const errors = [];
  const d = await settle(
    {
      'BIS repo RBI': () => bis('WS_CBPOL', 'D.IN', daysAgo(1100)),
      'BIS IPC India': () => bis('WS_LONG_CPI', 'M.IN.771', daysAgo(1200)),
      'FRED call India': () => fred(IN_FRED.call, daysAgo(1100)),
      'FRED 3M India': () => fred(IN_FRED.m3, daysAgo(1100)),
      'FRED 10Y India': () => fred(IN_FRED.y10, daysAgo(1100)),
      'FMI WEO India': () => weoOutlook('IND', { fiscal: true }),
      'Yahoo USDINR': () => yahooSeries('INR=X'),
      'Yahoo INDA/Nifty': () => equityBlock('INDA', 'iShares MSCI India (INDA, USD)', '^NSEI', 'Nifty 50'),
    },
    errors
  );
  const repo = d['BIS repo RBI'] || [];
  const cpi = d['BIS IPC India'] || [];
  const call = d['FRED call India'] || [];
  const m3 = d['FRED 3M India'] || [];
  const y10 = d['FRED 10Y India'] || [];
  const W = d['FMI WEO India'];
  const fx = d['Yahoo USDINR'] || [];
  // Proxy de expectativa de tasa: 3M interbancaria − repo (mensual). >0 el mercado descuenta subas; <0, bajas.
  const slope = spreadSeries(m3, repo);
  const from3y = cpi[0]?.d || iso(daysAgo(1100));

  return {
    id: 'in',
    name: 'India',
    flag: '🇮🇳',
    currency: 'INR',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Repo RBI', series: repo, decimals: 2, changeDays: 365, source: 'BIS WS_CBPOL (D.IN)', url: BIS_URL.cbpol }),
      kpi({ key: 'cpi', group: 'inflation', label: 'IPC a/a', series: cpi, decimals: 1, changeDays: 365, note: 'Meta del RBI: 4% ± 2 pp', source: 'BIS WS_LONG_CPI (M.IN.771)', url: BIS_URL.cpi }),
      weoKpi(W, 'Proyección del FMI (año fiscal abr–mar); el RBI publica encuestas solo en PDF'),
      kpi({ key: 'exp_rate', group: 'expectations', label: '3M interbancaria − repo', series: slope, note: 'Proxy mensual: >0 el mercado descuenta subas; <0, bajas', source: 'Cálculo propio (OCDE vía FRED + BIS)', url: fredUrl(IN_FRED.m3) }),
      { key: 'y2', group: 'market', label: 'G-sec 2Y', value: null, source: 'Pendiente', note: 'Sin fuente gratuita con API de la curva de G-secs (CCIL/FBIL); pendiente LSEG' },
      kpi({ key: 'm3', group: 'market', label: 'Interbancaria 3M (mensual)', series: m3, decimals: 2, source: `OCDE vía FRED ${IN_FRED.m3}`, url: fredUrl(IN_FRED.m3) }),
      kpi({ key: 'y10', group: 'market', label: 'G-sec 10Y (mensual)', series: y10, decimals: 2, changeDays: 365, source: `OCDE vía FRED ${IN_FRED.y10}`, url: fredUrl(IN_FRED.y10) }),
      kpi({ key: 'fx', group: 'fx', label: 'USDINR', series: fx, unit: '', decimals: 2, changeDays: 365, note: 'Rupias por dólar', source: 'Yahoo INR=X', url: 'https://finance.yahoo.com/quote/INR=X' }),
    ],
    equity: d['Yahoo INDA/Nifty'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Repo RBI vs IPC a/a',
        unit: '%',
        lines: [{ key: 'repo', label: 'Repo RBI', step: true }, { key: 'cpi', label: 'IPC a/a' }],
        data: merge({ repo: thin(repo.filter((p) => p.d >= from3y)), cpi }),
      },
      {
        id: 'rates',
        title: 'Call, interbancaria 3M y G-sec 10Y (mensual)',
        unit: '%',
        lines: [{ key: 'call', label: 'Call' }, { key: 'm3', label: '3M' }, { key: 'y10', label: '10Y' }],
        data: merge({ call, m3, y10 }),
      },
      { id: 'fx', title: 'USDINR', unit: '', lines: [{ key: 'v', label: 'USDINR' }], data: merge({ v: fx }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: 'Repo vs interbancaria 3M (lo que descuenta el mercado)',
        unit: '%',
        lines: [{ key: 'repo', label: 'Repo', step: true }, { key: 'm3', label: 'Interbancaria 3M' }],
        data: merge({ repo: thin(repo.filter((p) => p.d >= (m3[0]?.d || ''))), m3 }),
      },
    ],
    expectations: W ? [W.table] : [],
    path: null,
    calendar: upcoming(agendaEvents('in'), 20),
    errors,
  };
}
