// Estados Unidos: FRED (requiere FRED_API_KEY gratuita) + Yahoo (futuros Fed funds, índices).
import { getJson, clean, iso, daysAgo, daysAhead, settle, kpi, merge, thin, last, yoyFromIndex, upcoming, today, fmtMonthEs } from '../util.js';
import { equityBlock, fedFundsStrip, yahooSeries, fedFundsContractHistory } from '../yahoo.js';
import { meetingEvents } from '../calendar.js';

const KEY = () => {
  const k = process.env.FRED_API_KEY;
  if (!k) throw new Error('Falta FRED_API_KEY (gratis en fredaccount.stlouisfed.org)');
  return k;
};
const fredUrl = (id) => `https://fred.stlouisfed.org/series/${id}`;

export async function fred(id, from) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${KEY()}&file_type=json&observation_start=${iso(from)}`;
  const j = await getJson(url);
  return clean((j.observations || []).map((o) => ({ d: o.date, v: o.value === '.' ? NaN : parseFloat(o.value) })));
}

/** Próximas publicaciones relevantes según el calendario de releases de FRED. */
async function fredCalendar() {
  const url = `https://api.stlouisfed.org/fred/releases/dates?api_key=${KEY()}&file_type=json&realtime_start=${today()}&realtime_end=${iso(daysAhead(60))}&include_release_dates_with_no_data=true&sort_order=asc&limit=1000`;
  const j = await getJson(url);
  const re = /^(Consumer Price Index|Employment Situation|Gross Domestic Product|Personal Income and Outlays|Producer Price Index|Advance Monthly Sales for Retail|Job Openings and Labor Turnover)/i;
  const seen = new Set();
  return (j.release_dates || [])
    .filter((r) => re.test(r.release_name))
    .filter((r) => {
      const k = r.release_name + r.date;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((r) => ({ date: r.date, event: r.release_name, kind: 'data', url: `https://fred.stlouisfed.org/releases/calendar` }));
}

export default async function unitedStates() {
  const errors = [];
  const from3y = daysAgo(1200);
  const d = await settle(
    {
      'FRED DFEDTARU': () => fred('DFEDTARU', daysAgo(1100)),
      'FRED DFEDTARL': () => fred('DFEDTARL', daysAgo(1100)),
      'FRED EFFR': () => fred('EFFR', daysAgo(400)),
      'FRED CPIAUCSL': () => fred('CPIAUCSL', from3y),
      'FRED CPILFESL': () => fred('CPILFESL', from3y),
      'FRED PCEPILFE': () => fred('PCEPILFE', from3y),
      'FRED DGS2': () => fred('DGS2', daysAgo(400)),
      'FRED DGS10': () => fred('DGS10', daysAgo(400)),
      'FRED T5YIE': () => fred('T5YIE', daysAgo(400)),
      'FRED UNRATE': () => fred('UNRATE', daysAgo(800)),
      'Yahoo DXY': () => yahooSeries('DX-Y.NYB'),
      'Yahoo futuros ZQ': () => fedFundsStrip(14),
      'Yahoo ZQ +12m (historia)': () => fedFundsContractHistory(12),
      'Yahoo EUSA/^GSPC': () => equityBlock('EUSA', 'iShares MSCI USA (EUSA)', '^GSPC', 'S&P 500'),
      'FRED calendario': fredCalendar,
    },
    errors
  );

  const upper = d['FRED DFEDTARU'] || [];
  const lower = d['FRED DFEDTARL'] || [];
  const cpi = yoyFromIndex(d['FRED CPIAUCSL'] || []);
  const core = yoyFromIndex(d['FRED CPILFESL'] || []);
  const corePce = yoyFromIndex(d['FRED PCEPILFE'] || []);
  const y2 = d['FRED DGS2'] || [];
  const y10 = d['FRED DGS10'] || [];
  const dxy = d['Yahoo DXY'] || [];
  const src = (id) => ({ source: `FRED ${id}`, url: fredUrl(id) });

  const mid = last(upper) && last(lower) ? (last(upper).v + last(lower).v) / 2 : null;
  const strip = d['Yahoo futuros ZQ'];
  const zq12 = d['Yahoo ZQ +12m (historia)'];
  const from1y = iso(daysAgo(400));

  return {
    id: 'us',
    name: 'Estados Unidos',
    flag: '🇺🇸',
    currency: 'USD',
    kpis: [
      {
        ...kpi({ key: 'policy', group: 'policy', label: 'Fed funds (techo)', series: upper, changeDays: 365, ...src('DFEDTARU') }),
        note: last(lower) ? `Rango ${last(lower).v.toFixed(2)}–${last(upper)?.v.toFixed(2)}%` : undefined,
      },
      kpi({ key: 'effr', group: 'policy', label: 'EFFR', series: d['FRED EFFR'] || [], ...src('EFFR') }),
      kpi({ key: 'cpi', group: 'inflation', label: 'CPI a/a', series: cpi, changeDays: 365, source: 'FRED CPIAUCSL (calc. a/a)', url: fredUrl('CPIAUCSL') }),
      kpi({ key: 'core', group: 'inflation', label: 'Core CPI a/a', series: core, source: 'FRED CPILFESL (calc. a/a)', url: fredUrl('CPILFESL') }),
      kpi({ key: 'pce', group: 'inflation', label: 'Core PCE a/a', series: corePce, source: 'FRED PCEPILFE (calc. a/a)', url: fredUrl('PCEPILFE') }),
      kpi({
        key: 'exp_rate', group: 'expectations',
        label: zq12 ? `Fed funds implícita ${fmtMonthEs(zq12.month)}` : 'Fed funds implícita +12m',
        series: zq12?.series || [], decimals: 3,
        source: zq12 ? `Yahoo ${zq12.ticker} (100 − precio)` : 'Yahoo ZQ', url: 'https://www.cmegroup.com/markets/interest-rates/stirs/30-day-federal-fund.html',
      }),
      kpi({ key: 'exp_cpi', group: 'expectations', label: 'Breakeven 5Y', series: d['FRED T5YIE'] || [], ...src('T5YIE') }),
      kpi({ key: 'y2', group: 'market', label: 'UST 2Y', series: y2, changeDays: 30, ...src('DGS2') }),
      kpi({ key: 'y10', group: 'market', label: 'UST 10Y', series: y10, changeDays: 30, ...src('DGS10') }),
      kpi({ key: 'fx', group: 'fx', label: 'DXY', series: dxy, unit: '', decimals: 2, changeDays: 365, source: 'Yahoo DX-Y.NYB', url: 'https://finance.yahoo.com/quote/DX-Y.NYB' }),
      kpi({ key: 'unemp', group: 'activity', label: 'Desempleo', series: d['FRED UNRATE'] || [], ...src('UNRATE') }),
    ],
    equity: d['Yahoo EUSA/^GSPC'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Fed funds (techo) vs inflación',
        unit: '%',
        lines: [
          { key: 'ff', label: 'Fed funds techo', step: true },
          { key: 'cpi', label: 'CPI a/a' },
          { key: 'pce', label: 'Core PCE a/a' },
        ],
        data: merge({ ff: thin(upper.filter((p) => p.d >= (cpi[0]?.d || ''))), cpi, pce: corePce }),
      },
      {
        id: 'curve',
        title: 'Treasuries 2Y y 10Y',
        unit: '%',
        lines: [
          { key: 'y2', label: '2Y' },
          { key: 'y10', label: '10Y' },
        ],
        data: merge({ y2, y10 }),
      },
      { id: 'fx', title: 'Índice dólar (DXY)', unit: '', lines: [{ key: 'v', label: 'DXY' }], data: merge({ v: dxy }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: zq12 ? `Fed funds: techo actual vs implícita ${fmtMonthEs(zq12.month)} vs UST 2Y` : 'Fed funds vs UST 2Y',
        unit: '%',
        lines: [
          { key: 'ff', label: 'Fed funds techo', step: true },
          { key: 'zq', label: 'Implícita futuros' },
          { key: 'y2', label: 'UST 2Y' },
        ],
        data: merge({ ff: upper.filter((p) => p.d >= from1y), zq: zq12?.series || [], y2: y2.filter((p) => p.d >= from1y) }),
      },
      {
        id: 'exp-cpi',
        group: 'exp',
        title: 'Inflación esperada de mercado: breakeven 5Y',
        unit: '%',
        lines: [{ key: 'be', label: 'Breakeven 5Y' }],
        data: merge({ be: d['FRED T5YIE'] || [] }),
      },
    ],
    expectations: [],
    path: strip
      ? {
          title: 'Fed funds implícita en futuros (100 − precio ZQ)',
          kind: 'market',
          asOf: strip[0]?.date,
          current: mid,
          currentLabel: 'Punto medio del rango actual',
          path: strip.map((c) => ({ label: c.month, rate: c.implied })),
          source: 'CBOT 30-Day Fed Funds vía Yahoo',
          url: 'https://www.cmegroup.com/markets/interest-rates/stirs/30-day-federal-fund.html',
          note: 'Promedio mensual esperado de EFFR. Con una baja a mitad de mes, el contrato refleja solo parte del movimiento.',
        }
      : null,
    calendar: upcoming([...meetingEvents('us'), ...(d['FRED calendario'] || [])]),
    errors,
  };
}
