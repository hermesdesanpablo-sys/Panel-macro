// Eurozona: ECB Data Portal (SDMX, sin clave) + Yahoo.
import { getText, clean, iso, daysAgo, settle, kpi, merge, thin, last, upcoming } from '../util.js';
import { equityBlock } from '../yahoo.js';
import { meetingEvents } from '../calendar.js';

const ECB = 'https://data-api.ecb.europa.eu/service/data';
const ecbUrl = (flowKey) => `https://data.ecb.europa.eu/data/datasets/${flowKey.split('/')[0]}/${flowKey.replace('/', '.')}`;

export const ECB_SERIES = {
  dfr: 'FM/D.U2.EUR.4F.KR.DFR.LEV', // Deposit facility rate
  // El dataset ICP quedó congelado en dic-2025 (ingreso de Bulgaria, EA21). Desde 2026 el BCE publica en HICP,
  // con DATA_PROVIDER 4D0. Verificado contra la API el 18-nov-2026.
  hicp: 'HICP/M.U2.N.000000.4D0.ANR', // HICP general, a/a
  core: 'HICP/M.U2.N.XEF000.4D0.ANR', // HICP sin energía, alimentos, alcohol y tabaco, a/a
  eurusd: 'EXR/D.USD.EUR.SP00.A', // Tipo de referencia BCE (USD por EUR)
  estr: 'EST/B.EU000A2X2A25.WT', // €STR
  y2: 'YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y', // Curva AAA, spot 2Y
  y10: 'YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y', // Curva AAA, spot 10Y
  unemp: 'LFSI/M.I9.S.UNEHRT.TOTAL0.15_74.T', // Desempleo zona euro
  spfLT: 'SPF/Q.U2.HICP.POINT.LT.Q.AVG', // SPF: inflación esperada largo plazo
};
// Forwards instantáneos de la curva AAA: proxy (con prima por plazo) de la tasa esperada.
const FWD = ['3M', '6M', '9M', '1Y', '18M', '2Y'].map((t) => ({ label: t, key: `YC/B.U2.EUR.4F.G_N_A.SV_C_YM.IF_${t}` }));

/** Parser CSV mínimo que respeta comillas. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

/** TIME_PERIOD puede ser 2026-11-17, 2026-10 o 2026-Q3. */
function periodToIso(p) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  if (/^\d{4}-\d{2}$/.test(p)) return `${p}-01`;
  const q = p.match(/^(\d{4})-Q(\d)$/);
  if (q) return `${q[1]}-${String((Number(q[2]) - 1) * 3 + 1).padStart(2, '0')}-01`;
  return p;
}

export function parseEcbCsv(text) {
  const [head, ...rows] = parseCsv(text);
  const ti = head.indexOf('TIME_PERIOD');
  const vi = head.indexOf('OBS_VALUE');
  if (ti < 0 || vi < 0) throw new Error('CSV del BCE sin columnas TIME_PERIOD/OBS_VALUE');
  return clean(rows.map((r) => ({ d: periodToIso(r[ti]), v: parseFloat(r[vi]) })));
}

export async function ecb(flowKey, from) {
  const t = await getText(`${ECB}/${flowKey}?format=csvdata&startPeriod=${iso(from)}`, { headers: { Accept: 'text/csv' } });
  return parseEcbCsv(t);
}
async function ecbLast(flowKey, n = 1) {
  const t = await getText(`${ECB}/${flowKey}?format=csvdata&lastNObservations=${n}`, { headers: { Accept: 'text/csv' } });
  return parseEcbCsv(t);
}

export default async function eurozone() {
  const errors = [];
  const S = ECB_SERIES;
  const d = await settle(
    {
      'BCE DFR': () => ecb(S.dfr, daysAgo(1100)),
      'BCE HICP': () => ecb(S.hicp, daysAgo(1100)),
      'BCE HICP core': () => ecb(S.core, daysAgo(1100)),
      'BCE EURUSD': () => ecb(S.eurusd, daysAgo(400)),
      'BCE €STR': () => ecb(S.estr, daysAgo(120)),
      'BCE curva 2Y': () => ecb(S.y2, daysAgo(400)),
      'BCE curva 10Y': () => ecb(S.y10, daysAgo(400)),
      'BCE desempleo': () => ecb(S.unemp, daysAgo(800)),
      'BCE SPF largo plazo': () => ecb(S.spfLT, daysAgo(1100)),
      'BCE forward 1Y (historia)': () => ecb(FWD.find((f) => f.label === '1Y').key, daysAgo(400)),
      'BCE forwards AAA': async () => {
        const res = await Promise.all(FWD.map((f) => ecbLast(f.key, 1).then((s) => ({ label: f.label, rate: last(s)?.v, date: last(s)?.d })).catch(() => null)));
        const ok = res.filter((r) => r && Number.isFinite(r.rate));
        if (!ok.length) throw new Error('Sin forwards de la curva AAA');
        return ok;
      },
      'Yahoo EZU/^STOXX50E': () => equityBlock('EZU', 'iShares MSCI Eurozone (EZU, USD)', '^STOXX50E', 'Euro Stoxx 50'),
    },
    errors
  );

  const dfr = d['BCE DFR'] || [];
  const hicp = d['BCE HICP'] || [];
  const core = d['BCE HICP core'] || [];
  const eurusd = d['BCE EURUSD'] || [];
  const y2 = d['BCE curva 2Y'] || [];
  const y10 = d['BCE curva 10Y'] || [];
  const src = (k) => ({ source: `BCE ${k.replace('/', '.')}`, url: ecbUrl(k) });
  const fwd = d['BCE forwards AAA'];
  const spf = d['BCE SPF largo plazo'];
  const fwd1y = d['BCE forward 1Y (historia)'] || [];
  const from1y = iso(daysAgo(400));

  return {
    id: 'eu',
    name: 'Eurozona',
    flag: '🇪🇺',
    currency: 'EUR',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Tasa de depósito (DFR)', series: dfr, changeDays: 365, ...src(S.dfr) }),
      kpi({ key: 'estr', group: 'policy', label: '€STR', series: d['BCE €STR'] || [], decimals: 3, ...src(S.estr) }),
      kpi({ key: 'cpi', group: 'inflation', label: 'HICP a/a', series: hicp, changeDays: 365, ...src(S.hicp) }),
      kpi({ key: 'core', group: 'inflation', label: 'HICP core a/a', series: core, ...src(S.core) }),
      kpi({ key: 'exp_rate', group: 'expectations', label: 'Forward 1Y curva AAA', series: fwd1y, decimals: 3, note: 'Proxy de tasa esperada a 1 año (incluye prima por plazo)', source: 'BCE YC IF_1Y', url: 'https://data.ecb.europa.eu/data/datasets/YC' }),
      kpi({ key: 'exp_cpi', group: 'expectations', label: 'Infl. esperada LP (SPF)', series: spf || [], ...src(S.spfLT) }),
      kpi({ key: 'y2', group: 'market', label: 'Curva AAA 2Y', series: y2, changeDays: 30, ...src(S.y2) }),
      kpi({ key: 'y10', group: 'market', label: 'Curva AAA 10Y', series: y10, changeDays: 30, ...src(S.y10) }),
      kpi({ key: 'fx', group: 'fx', label: 'EURUSD (ref. BCE)', series: eurusd, unit: '', decimals: 4, changeDays: 365, ...src(S.eurusd) }),
      kpi({ key: 'unemp', group: 'activity', label: 'Desempleo', series: d['BCE desempleo'] || [], decimals: 1, ...src(S.unemp) }),
    ],
    equity: d['Yahoo EZU/^STOXX50E'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Tasa de depósito vs HICP',
        unit: '%',
        lines: [
          { key: 'dfr', label: 'DFR', step: true },
          { key: 'hicp', label: 'HICP a/a' },
          { key: 'core', label: 'HICP core a/a' },
        ],
        data: merge({ dfr: thin(dfr.filter((p) => p.d >= (hicp[0]?.d || ''))), hicp, core }),
      },
      { id: 'curve', title: 'Curva AAA zona euro: 2Y y 10Y', unit: '%', lines: [{ key: 'y2', label: '2Y' }, { key: 'y10', label: '10Y' }], data: merge({ y2, y10 }) },
      { id: 'fx', title: 'EURUSD – referencia BCE', unit: '', lines: [{ key: 'v', label: 'EURUSD' }], data: merge({ v: eurusd }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: 'DFR vs forward 1Y y spot 2Y (curva AAA)',
        unit: '%',
        lines: [
          { key: 'dfr', label: 'DFR', step: true },
          { key: 'f1', label: 'Forward 1Y' },
          { key: 'y2', label: 'Spot 2Y' },
        ],
        data: merge({ dfr: dfr.filter((p) => p.d >= from1y), f1: fwd1y, y2: y2.filter((p) => p.d >= from1y) }),
      },
    ],
    expectations: [],
    path: fwd
      ? {
          title: 'Forwards instantáneos curva AAA (proxy de tasa esperada)',
          kind: 'market',
          asOf: fwd[0]?.date,
          current: last(dfr)?.v,
          currentLabel: 'DFR actual',
          path: fwd,
          source: 'BCE – Yield curves (YC)',
          url: 'https://data.ecb.europa.eu/data/datasets/YC',
          note: 'Incluye prima por plazo y spread AAA vs €STR: sirve para la dirección, no como probabilidad exacta.',
        }
      : null,
    calendar: upcoming(meetingEvents('eu')),
    errors,
  };
}
