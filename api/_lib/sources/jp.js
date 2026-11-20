// Japón: Banco de Japón (API de series, sin clave) + Ministerio de Finanzas (curva JGB) + BIS (IPC) + Yahoo.
import { getJson, getText, clean, iso, daysAgo, settle, kpi, merge, thin, last, upcoming, spreadSeries } from '../util.js';
import { equityBlock, yahooSeries } from '../yahoo.js';
import { agendaEvents } from '../calendar.js';

const BOJ_API = 'https://www.stat-search.boj.or.jp/api/v1/getDataCode';
const BOJ_URL = 'https://www.stat-search.boj.or.jp/index_en.html';
export const BOJ = {
  call: ['FM01', 'STRDCLUCON'], // Call O/N sin garantía, promedio diario (instrumento de la política)
  tankan: ['CO', 'TK99F0000204HCQ00000'], // Tankan: inflación esperada a 1 año, promedio empresas (todas)
};
// Curva JGB (constant maturity, 1Y–40Y): histórico hasta el mes anterior + mes en curso.
const MOF_ALL = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv';
const MOF_CUR = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv';
const MOF_URL = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm';
// IPC a/a: el BIS lo republica mensual (la OCDE y FRED dejaron de publicar el IPC de Japón en 2022).
const BIS_CPI = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LONG_CPI/1.0/M.JP.771';
const BIS_URL = 'https://data.bis.org/topics/CPI';

/** Fechas BoJ: diaria 20261116, mensual 202610, trimestral 202603 (= 3er trimestre). */
function bojDate(x, freq) {
  const s = String(x);
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (freq === 'QUARTERLY') return `${s.slice(0, 4)}-${String(Number(s.slice(4)) * 3).padStart(2, '0')}-01`;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-01`;
}
export function parseBoj(j) {
  const r = j?.RESULTSET?.[0];
  if (!r) throw new Error(`BoJ: ${j?.MESSAGE || 'respuesta sin series'}`);
  const { SURVEY_DATES: ds = [], VALUES: vs = [] } = r.VALUES || {};
  return clean(ds.map((d, i) => ({ d: bojDate(d, r.FREQUENCY), v: vs[i] })));
}
export async function boj([db, code], from) {
  // startDate: diaria/mensual = AAAAMM; trimestral (Tankan) = AAAA0T (T = 1..4).
  const f = iso(from);
  const start = db === 'CO' ? `${f.slice(0, 4)}0${Math.floor((Number(f.slice(5, 7)) - 1) / 3) + 1}` : f.slice(0, 7).replace('-', '');
  return parseBoj(await getJson(`${BOJ_API}?format=json&lang=en&db=${db}&code=${code}&startDate=${start}`));
}

/** CSV del MOF: "Date,1Y,2Y,...,40Y" con fechas 2026/11/17 y '-' para faltantes. */
export function parseMof(text) {
  const lines = text.split(/\r?\n/);
  const hi = lines.findIndex((l) => l.startsWith('Date,'));
  if (hi < 0) throw new Error('MOF: CSV sin encabezado Date');
  const cols = lines[hi].split(',');
  const out = {};
  for (const c of cols.slice(1)) out[c.trim()] = [];
  for (const l of lines.slice(hi + 1)) {
    const c = l.split(',');
    const m = c[0]?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) continue;
    const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    cols.slice(1).forEach((k, i) => out[k.trim()].push({ d, v: parseFloat(c[i + 1]) }));
  }
  for (const k of Object.keys(out)) out[k] = clean(out[k]);
  return out;
}
async function jgb(from) {
  const [all, cur] = await Promise.all([getText(MOF_ALL, { timeout: 25000 }), getText(MOF_CUR).catch(() => '')]);
  const a = parseMof(all), c = cur ? parseMof(cur) : {};
  const f = iso(from);
  const pick = (k) => clean([...(a[k] || []), ...(c[k] || [])].filter((p, i, arr) => p.d >= f && arr.findIndex((q) => q.d === p.d) === i));
  return { y1: pick('1Y'), y2: pick('2Y'), y5: pick('5Y'), y10: pick('10Y'), y30: pick('30Y') };
}

export function parseBisCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/).map((l) => l.split(','));
  const ti = head.indexOf('TIME_PERIOD'), vi = head.indexOf('OBS_VALUE');
  if (ti < 0 || vi < 0) throw new Error('BIS: CSV sin TIME_PERIOD/OBS_VALUE');
  return clean(rows.map((r) => ({ d: `${r[ti]}-01`, v: parseFloat(r[vi]) })));
}

export default async function japan() {
  const errors = [];
  const d = await settle(
    {
      'BoJ call O/N': () => boj(BOJ.call, daysAgo(1100)),
      'BoJ Tankan inflación esperada': () => boj(BOJ.tankan, daysAgo(1500)),
      'MOF curva JGB': () => jgb(daysAgo(400)),
      'BIS IPC Japón': async () => parseBisCsv(await getText(`${BIS_CPI}?startPeriod=${iso(daysAgo(1200)).slice(0, 7)}&format=csv`, { timeout: 25000 })),
      'Yahoo USDJPY': () => yahooSeries('JPY=X'),
      'Yahoo EWJ/^N225': () => equityBlock('EWJ', 'iShares MSCI Japan (EWJ, USD)', '^N225', 'Nikkei 225'),
    },
    errors
  );
  const call = d['BoJ call O/N'] || [];
  const curve = d['MOF curva JGB'] || { y1: [], y2: [], y5: [], y10: [], y30: [] };
  const cpi = d['BIS IPC Japón'] || [];
  const tankan = d['BoJ Tankan inflación esperada'] || [];
  const fx = d['Yahoo USDJPY'] || [];
  const slope = spreadSeries(curve.y2, call);
  const bojSrc = (code) => ({ source: `BoJ ${code}`, url: BOJ_URL });
  const mof = (t) => ({ source: `MOF JGB ${t}`, url: MOF_URL });
  const from1y = iso(daysAgo(400));

  return {
    id: 'jp',
    name: 'Japón',
    flag: '🇯🇵',
    currency: 'JPY',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Call O/N (tasa de política)', series: call, decimals: 3, changeDays: 365, note: 'Tasa call sin garantía: el BoJ fija su meta sobre esta tasa', ...bojSrc(BOJ.call[1]) }),
      kpi({ key: 'cpi', group: 'inflation', label: 'IPC a/a', series: cpi, decimals: 1, changeDays: 365, source: 'BIS WS_LONG_CPI (M.JP.771)', url: BIS_URL }),
      kpi({ key: 'exp_cpi', group: 'expectations', label: 'Inflación esperada 1a (Tankan)', series: tankan, decimals: 1, note: 'Promedio de empresas, todas las industrias', ...bojSrc('Tankan') }),
      kpi({ key: 'exp_rate', group: 'expectations', label: 'JGB 2Y − call', series: slope, note: 'Proxy: >0 el mercado descuenta subas; <0, bajas', source: 'Cálculo propio (MOF + BoJ)', url: MOF_URL }),
      kpi({ key: 'y2', group: 'market', label: 'JGB 2Y', series: curve.y2, decimals: 3, changeDays: 30, ...mof('2Y') }),
      kpi({ key: 'y10', group: 'market', label: 'JGB 10Y', series: curve.y10, decimals: 3, changeDays: 30, ...mof('10Y') }),
      kpi({ key: 'y30', group: 'market', label: 'JGB 30Y', series: curve.y30, decimals: 3, ...mof('30Y') }),
      kpi({ key: 'fx', group: 'fx', label: 'USDJPY', series: fx, unit: '', decimals: 2, changeDays: 365, source: 'Yahoo JPY=X', url: 'https://finance.yahoo.com/quote/JPY=X' }),
    ],
    equity: d['Yahoo EWJ/^N225'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Tasa call vs IPC a/a',
        unit: '%',
        lines: [
          { key: 'call', label: 'Call O/N', step: true },
          { key: 'cpi', label: 'IPC a/a' },
        ],
        data: merge({ call: thin(call.filter((p) => p.d >= (cpi[0]?.d || ''))), cpi }),
      },
      { id: 'curve', title: 'Curva JGB: 2Y, 10Y y 30Y', unit: '%', lines: [{ key: 'y2', label: '2Y' }, { key: 'y10', label: '10Y' }, { key: 'y30', label: '30Y' }], data: merge({ y2: curve.y2, y10: curve.y10, y30: curve.y30 }) },
      { id: 'fx', title: 'USDJPY', unit: '', lines: [{ key: 'v', label: 'USDJPY' }], data: merge({ v: fx }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: 'Call O/N vs JGB 1Y y 2Y (lo que descuenta el mercado)',
        unit: '%',
        lines: [
          { key: 'call', label: 'Call O/N', step: true },
          { key: 'y1', label: 'JGB 1Y' },
          { key: 'y2', label: 'JGB 2Y' },
        ],
        data: merge({ call: thin(call.filter((p) => p.d >= from1y)), y1: curve.y1, y2: curve.y2 }),
      },
      {
        id: 'exp-cpi',
        group: 'exp',
        title: 'IPC a/a vs inflación esperada por empresas (Tankan)',
        unit: '%',
        lines: [{ key: 'cpi', label: 'IPC a/a' }, { key: 'tk', label: 'Esperada 1a (Tankan)' }],
        data: merge({ cpi, tk: tankan.filter((p) => p.d >= (cpi[0]?.d || '')) }),
      },
    ],
    expectations: [],
    path: null,
    calendar: upcoming(agendaEvents('jp'), 20),
    errors,
  };
}
