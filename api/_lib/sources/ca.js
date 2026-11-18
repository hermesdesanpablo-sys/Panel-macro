// Canadá: Bank of Canada Valet API (sin clave) + Yahoo.
import { getJson, clean, iso, daysAgo, settle, kpi, merge, last, yoyFromIndex, upcoming, spreadSeries } from '../util.js';
import { equityBlock } from '../yahoo.js';
import { meetingEvents } from '../calendar.js';

// Lista de series: https://www.bankofcanada.ca/valet/lists/series/json
export const VALET = {
  target: 'V39079', // Target for the overnight rate
  corra: 'AVG.INTWO', // CORRA
  usdcad: 'FXUSDCAD', // USD/CAD (BoC)
  y2: 'BD.CDN.2YR.DQ.YLD', // GoC 2Y
  y10: 'BD.CDN.10YR.DQ.YLD', // GoC 10Y
  cpiIndex: 'V41690973', // CPI all-items (índice) -> a/a calculado (verificar)
  cpiTrim: 'CPI_TRIM', // Core: CPI-trim a/a
  cpiMedian: 'CPI_MEDIAN', // Core: CPI-median a/a
  long: 'BD.CDN.LONG.DQ.YLD', // GoC benchmark largo (nominal)
  rrb: 'BD.CDN.RRB.DQ.YLD', // Real Return Bonds, largo plazo
};
const valetUrl = (id) => `https://www.bankofcanada.ca/valet/series/${id}`;

export function parseValet(j, id) {
  return clean((j.observations || []).map((o) => ({ d: o.d, v: parseFloat(o[id]?.v) })));
}

// Una serie por request: si un código cambia, no cae todo el bloque.
export async function valet(id, from) {
  const j = await getJson(`https://www.bankofcanada.ca/valet/observations/${id}/json?start_date=${iso(from)}`);
  return parseValet(j, id);
}

export default async function canada() {
  const errors = [];
  const V = VALET;
  const d = await settle(
    {
      'BoC V39079': () => valet(V.target, daysAgo(1100)),
      'BoC CORRA': () => valet(V.corra, daysAgo(120)),
      'BoC USD/CAD': () => valet(V.usdcad, daysAgo(400)),
      'BoC 2Y': () => valet(V.y2, daysAgo(400)),
      'BoC 10Y': () => valet(V.y10, daysAgo(400)),
      'BoC CPI índice': () => valet(V.cpiIndex, daysAgo(1500)),
      'BoC CPI-trim': () => valet(V.cpiTrim, daysAgo(1100)),
      'BoC CPI-median': () => valet(V.cpiMedian, daysAgo(1100)),
      'BoC largo nominal': () => valet(V.long, daysAgo(400)),
      'BoC RRB': () => valet(V.rrb, daysAgo(400)),
      'Yahoo EWC/^GSPTSE': () => equityBlock('EWC', 'iShares MSCI Canada (EWC, USD)', '^GSPTSE', 'S&P/TSX'),
    },
    errors
  );

  const target = d['BoC V39079'] || [];
  const cpi = yoyFromIndex(d['BoC CPI índice'] || []).filter((p) => p.d >= iso(daysAgo(1100)));
  const trim = d['BoC CPI-trim'] || [];
  const y2 = d['BoC 2Y'] || [];
  const y10 = d['BoC 10Y'] || [];
  const usdcad = d['BoC USD/CAD'] || [];
  const src = (id) => ({ source: `BoC Valet ${id}`, url: valetUrl(id) });
  const slope = spreadSeries(y2, target);
  // Inflación implícita de largo plazo: bono nominal largo − Real Return Bond (aprox. aditiva).
  const breakeven = spreadSeries(d['BoC largo nominal'] || [], d['BoC RRB'] || []);

  return {
    id: 'ca',
    name: 'Canadá',
    flag: '🇨🇦',
    currency: 'CAD',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Tasa overnight (objetivo)', series: target, changeDays: 365, ...src(V.target) }),
      kpi({ key: 'corra', group: 'policy', label: 'CORRA', series: d['BoC CORRA'] || [], ...src(V.corra) }),
      kpi({ key: 'cpi', group: 'inflation', label: 'CPI a/a', series: cpi, changeDays: 365, source: `BoC Valet ${V.cpiIndex} (calc. a/a)`, url: valetUrl(V.cpiIndex) }),
      kpi({ key: 'trim', group: 'inflation', label: 'CPI-trim a/a', series: trim, ...src(V.cpiTrim) }),
      kpi({ key: 'median', group: 'inflation', label: 'CPI-median a/a', series: d['BoC CPI-median'] || [], ...src(V.cpiMedian) }),
      kpi({ key: 'exp_rate', group: 'expectations', label: 'GoC 2Y − overnight', series: slope.map((p) => ({ d: p.d, v: p.v })), note: 'Proxy: >0 el mercado descuenta subas; <0, bajas', source: 'Cálculo propio (Valet)', url: valetUrl(V.y2) }),
      kpi({ key: 'exp_cpi', group: 'expectations', label: 'Inflación implícita LP', series: breakeven, note: 'Breakeven: bono largo nominal − Real Return Bond', source: 'Cálculo propio (Valet LONG − RRB)', url: valetUrl(V.rrb) }),
      kpi({ key: 'y2', group: 'market', label: 'GoC 2Y', series: y2, changeDays: 30, ...src(V.y2) }),
      kpi({ key: 'y10', group: 'market', label: 'GoC 10Y', series: y10, changeDays: 30, ...src(V.y10) }),
      kpi({ key: 'fx', group: 'fx', label: 'USD/CAD', series: usdcad, unit: '', decimals: 4, changeDays: 365, ...src(V.usdcad) }),
    ],
    equity: d['Yahoo EWC/^GSPTSE'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Tasa overnight vs inflación',
        unit: '%',
        lines: [
          { key: 'tgt', label: 'Overnight', step: true },
          { key: 'cpi', label: 'CPI a/a' },
          { key: 'trim', label: 'CPI-trim a/a' },
        ],
        data: merge({ tgt: target.filter((p) => p.d >= (trim[0]?.d || '')), cpi, trim }),
      },
      { id: 'curve', title: 'Bonos del Gobierno de Canadá: 2Y y 10Y', unit: '%', lines: [{ key: 'y2', label: '2Y' }, { key: 'y10', label: '10Y' }], data: merge({ y2, y10 }) },
      { id: 'fx', title: 'USD/CAD', unit: '', lines: [{ key: 'v', label: 'USD/CAD' }], data: merge({ v: usdcad }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: 'Tasa overnight vs GoC 2Y (lo que descuenta el mercado)',
        unit: '%',
        lines: [
          { key: 'tgt', label: 'Overnight', step: true },
          { key: 'y2', label: 'GoC 2Y' },
        ],
        data: merge({ tgt: target.filter((p) => p.d >= (y2[0]?.d || '')), y2 }),
      },
    ],
    expectations: [],
    path: null,
    calendar: upcoming(meetingEvents('ca')),
    errors,
  };
}
