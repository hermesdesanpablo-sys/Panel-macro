// Chile: Banco Central de Chile (cuadros públicos de la BDE, sin clave) + Yahoo (USD/CLP intradía, ECH).
//
// Fuente principal: API oficial de la BDE (SieteRestWS) con BCCH_API_TOKEN (API Key Token; VENCE AL AÑO de generarlo,
// se renueva en "Mi Cuenta" de la BDE). Si no hay token o la API falla, se usan las páginas públicas de "cuadros" de la
// BDE (HTML): cada serie es una fila con su código (data-serie) y las fechas van en los encabezados.
// URL estable: https://si3.bcentral.cl/Siete/ES/Siete/Cuadro/<CAP>/<MENU>/<CUADRO>
// - Cuadros diarios: muestran el año en curso; ?cbFechaDiaria=AAAA trae otro año.
// - Cuadros mensuales: traen varios años por defecto.
import { getText, clean, iso, daysAgo, settle, kpi, merge, thin, last, upcoming, spreadSeries, yoyFromIndex, valueAt } from '../util.js';
import { yahooSeries, perf } from '../yahoo.js';
import { meetingEvents } from '../calendar.js';

const BDE = 'https://si3.bcentral.cl/Siete/ES/Siete/Cuadro';
export const CUADROS = {
  tasas: 'CAP_BDP/MN_EST_MACRO_IV/PEM_TPMyTASAS', // TPM y BCP/BCU 2-5-10 (diario)
  dolar: 'CAP_TIPO_CAMBIO/MN_TIPO_CAMBIO4/DOLAR_OBS_ADO', // dólar observado (diario)
  ipc: 'CAP_BDP/MN_EST_MACRO_IV/PEM_VAR12_IPC_BS23', // IPC var. 12 meses (mensual)
  bolsa: 'CAP_BDP/MN_EST_MACRO_IV/PEM_INDBUR', // IPSA (mensual)
  imacec: 'CAP_BDP/MN_EST_MACRO_IV/PEM_ACTyDDA_IMACEC_2_2018', // Imacec (mensual)
  eeeInf: 'CAP_EXP_ECO/MN_EXP_EC11/EXE_BCCH_01', // Encuesta de Expectativas Económicas: inflación
  eeeTpm: 'CAP_EXP_ECO/MN_EXP_EC11/EXE_BCCH_02', // EEE: TPM
  eeePib: 'CAP_EXP_ECO/MN_EXP_EC11/EXE_BCCH_05', // EEE: PIB
  eofInf: 'CAP_EXP_ECO/MN_EXP_EC11/EXE_EOF_1', // Encuesta de Operadores Financieros: inflación (quincenal)
  eofTpm: 'CAP_EXP_ECO/MN_EXP_EC11/EXE_EOF_2', // EOF: TPM
};
export const S = {
  tpm: 'F022.TPM.TIN.D001.NO.Z.D',
  bcp2: 'F022.BCLP.TIS.AN02.NO.Z.D', bcp5: 'F022.BCLP.TIS.AN05.NO.Z.D', bcp10: 'F022.BCLP.TIS.AN10.NO.Z.D',
  bcu5: 'F022.BUF.TIS.AN05.UF.Z.D', bcu10: 'F022.BUF.TIS.AN10.UF.Z.D',
  dolar: 'F073.TCO.PRE.Z.D',
  ipc: 'F074.IPC.IND.Z.EP09.C.M',
  ipsa: 'F013.IBC.IND.N.7.LAC.CL.CLP.BLO.M',
  imacec: 'F032.IMC.IND.Z.Z.EP18.Z.Z.0.M',
  eeeInf11: 'F089.IPC.V12.14.M', eeeInf23: 'F089.IPC.V12.15.M',
  eofInf12: 'F089.EOF.VII.12MS.D', eofInf24: 'F089.EOF.VII.S12M.D',
  eofTpm12: 'F089.EOF.TPM.12MS.D', eofTpm24: 'F089.EOF.TPM.24MS.D',
  // Trayectoria de TPM esperada (EEE): [código, etiqueta]
  eeePath: [
    ['F089.TPM.TAS.11.M', 'Próx. reunión'], ['F089.TPM.TAS.31.M', 'Subsig.'], ['F089.TPM.TAS.26.M', '5 meses'],
    ['F089.TPM.TAS.14.M', '11 meses'], ['F089.TPM.TAS.30.M', '17 meses'], ['F089.TPM.TAS.15.M', '23 meses'], ['F089.TPM.TAS.35.M', '35 meses'],
  ],
};
const bdeUrl = (path) => `${BDE}/${path}`;
const API = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx';

/** Una serie por la API oficial. Fechas 'dd-mm-aaaa', valores con punto decimal ('NaN' si falta). */
export function parseBdeApi(j, code) {
  if (j?.Codigo !== 0) {
    const msg = j?.Descripcion || 'respuesta inesperada';
    throw new Error(/password|token/i.test(msg) ? `API BCCh: token inválido o vencido (${msg}). Renovarlo en "Mi Cuenta" de la BDE.` : `API BCCh ${code}: ${msg}`);
  }
  return clean((j.Series?.Obs || []).map((o) => {
    const [dd, mm, yy] = String(o.indexDateString).split('-');
    return { d: `${yy}-${mm}-${dd}`, v: parseFloat(o.value) };
  }));
}
async function bdeApi(code, from) {
  const qs = new URLSearchParams({ token: process.env.BCCH_API_TOKEN, function: 'GetSeries', timeseries: code, firstdate: iso(from) });
  const r = await fetch(`${API}?${qs}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en la API del BCCh`);
  // La API responde en latin-1 (los títulos tienen tildes); los datos son ASCII.
  return parseBdeApi(JSON.parse(new TextDecoder('latin1').decode(await r.arrayBuffer())), code);
}

/**
 * Un grupo de series: por la API si hay token (las del grupo en paralelo); si falla, el cuadro público equivalente.
 * Devuelve { data: {código: serie}, via: 'api' | 'cuadro' } y anota en `errors` por qué se usó el respaldo.
 */
async function group(path, codes, { daily = false, errors }) {
  if (process.env.BCCH_API_TOKEN) {
    try {
      const from = daysAgo(daily ? 800 : 365 * 6);
      const res = await Promise.all(codes.map((c) => bdeApi(c, from).then((s) => [c, s], (e) => (/token/.test(e.message) ? Promise.reject(e) : [c, []]))));
      const data = Object.fromEntries(res);
      if (Object.values(data).some((s) => s.length)) return { data, via: 'api' };
      throw new Error(`API BCCh: sin datos para ${path.split('/').pop()}`);
    } catch (e) {
      if (!errors.some((x) => x.message === e.message)) errors.push({ source: 'API BCCh (se usan los cuadros públicos)', message: e.message });
    }
  }
  return { data: daily ? await bdeDaily(path) : await bde(path), via: 'cuadro' };
}

const MES = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' };
/** '17.Nov.2026' → 2026-11-17 · 'Nov.2026' → 2026-11-01 */
function bdeDate(h) {
  const m = h.trim().match(/^(?:(\d{1,2})\.)?([A-Za-zé]{3})\.(\d{4})$/);
  if (!m || !MES[m[2].toLowerCase()]) return null;
  return `${m[3]}-${MES[m[2].toLowerCase()]}-${(m[1] || '1').padStart(2, '0')}`;
}
const num = (s) => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));

/** HTML de un cuadro de la BDE → { código: [{d, v}] }. */
export function parseBdeCuadro(html) {
  const dates = [...html.matchAll(/<th[^>]*>\s*([^<]{3,40}?)\s*<\/th>/g)].map((m) => bdeDate(m[1])).filter(Boolean);
  if (!dates.length) throw new Error('BDE: cuadro sin fechas (¿cambió el formato?)');
  const out = {};
  for (const m of html.matchAll(/data-serie="(F[^"]+)"[\s\S]*?<span class="sname">[^<]*<\/span>([\s\S]*?)<\/tr>/g)) {
    const vals = [...m[2].matchAll(/<td class="ar col">([^<]*)<\/td>/g)].map((x) => x[1].trim());
    out[m[1]] = clean(vals.map((v, i) => (v && dates[i] ? { d: dates[i], v: num(v) } : null)).filter(Boolean));
  }
  if (!Object.keys(out).length) throw new Error('BDE: cuadro sin series');
  return out;
}

export async function bde(path, { year } = {}) {
  const url = bdeUrl(path) + (year ? `?cbFechaDiaria=${year}&cbFrecuencia=DAILY&cbCalculo=NONE&cbFechaBase=` : '');
  return parseBdeCuadro(await getText(url, { headers: { 'User-Agent': 'Mozilla/5.0 (macro-dashboard)' }, timeout: 25000 }));
}
/** Cuadro diario: año en curso + anterior, unidos por serie. */
async function bdeDaily(path) {
  const y = new Date().getUTCFullYear();
  const [a, b] = await Promise.all([bde(path, { year: y - 1 }).catch(() => ({})), bde(path)]);
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = clean([...(a[k] || []), ...(b[k] || [])].filter((p, i, arr) => arr.findIndex((q) => q.d === p.d) === i));
  return out;
}

export default async function chile() {
  const errors = [];
  const C = CUADROS;
  const y0n = new Date().getUTCFullYear();
  const yrs = (prefix) => [y0n - 1, y0n, y0n + 1, y0n + 2].map((y) => `${prefix}${y}.M`);
  const G = (path, codes, daily) => () => group(path, codes, { daily, errors });
  const raw = await settle(
    {
      'BCCh TPM y bonos BCP/BCU': G(C.tasas, [S.tpm, S.bcp2, S.bcp5, S.bcp10, S.bcu5, S.bcu10], true),
      'BCCh dólar observado': G(C.dolar, [S.dolar], true),
      'BCCh IPC': G(C.ipc, [S.ipc]),
      'BCCh IPSA': G(C.bolsa, [S.ipsa]),
      'BCCh Imacec': G(C.imacec, [S.imacec]),
      'BCCh EEE inflación': G(C.eeeInf, [S.eeeInf11, S.eeeInf23, ...yrs('F089.IPC.V12.')]),
      'BCCh EEE TPM': G(C.eeeTpm, S.eeePath.map(([c]) => c)),
      'BCCh EEE PIB': G(C.eeePib, yrs('F089.PIB.V12.')),
      'BCCh EOF inflación': G(C.eofInf, [S.eofInf12, S.eofInf24], true),
      'BCCh EOF TPM': G(C.eofTpm, [S.eofTpm12, S.eofTpm24], true),
      'Yahoo ECH': () => yahooSeries('ECH'),
    },
    errors
  );
  const via = Object.values(raw).some((x) => x?.via === 'api') ? 'API' : 'BDE';
  const d = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v && v.data ? v.data : v]));
  const g = (k) => d[k] || {};
  const T = g('BCCh TPM y bonos BCP/BCU');
  const tpm = T[S.tpm] || [];
  const bcp2 = T[S.bcp2] || [], bcp10 = T[S.bcp10] || [], bcu10 = T[S.bcu10] || [];
  const usdclp = g('BCCh dólar observado')[S.dolar] || [];
  const ipc = g('BCCh IPC')[S.ipc] || [];
  const ipsa = g('BCCh IPSA')[S.ipsa] || [];
  const imacec = yoyFromIndex(g('BCCh Imacec')[S.imacec] || []);
  const EI = g('BCCh EEE inflación'), ET = g('BCCh EEE TPM'), EP = g('BCCh EEE PIB');
  const OI = g('BCCh EOF inflación'), OT = g('BCCh EOF TPM');
  const eeeInf11 = EI[S.eeeInf11] || [], eeeTpm11 = ET['F089.TPM.TAS.14.M'] || [];
  const eofTpm12 = OT[S.eofTpm12] || [], eofInf12 = OI[S.eofInf12] || [];
  // Inflación implícita 10 años: BCP (nominal) vs BCU (en UF, real). Aproximación de Fisher.
  const be10 = [];
  for (const p of bcp10) {
    const r = valueAt(bcu10, p.d);
    if (r && r.d === p.d) be10.push({ d: p.d, v: ((1 + p.v / 100) / (1 + r.v / 100) - 1) * 100 });
  }
  const slope = spreadSeries(bcp2, tpm);
  const src = (path, code) => ({ source: `BCCh ${via} ${code}`, url: bdeUrl(path) });
  const from1y = iso(daysAgo(400));
  const ech = d['Yahoo ECH'];

  // Trayectoria de TPM esperada (última EEE)
  const asOfEee = last(EI[S.eeeInf11] || [])?.d || last(eeeTpm11)?.d;
  const pathPts = S.eeePath.map(([code, label]) => {
    const p = last(ET[code] || []);
    return p && p.d === asOfEee ? { label, rate: p.v } : null;
  }).filter(Boolean);

  // Tabla de expectativas: última encuesta y la de 3 meses antes.
  const y0 = Number((asOfEee || iso(new Date())).slice(0, 4));
  const prevM = asOfEee ? iso(new Date(Date.UTC(+asOfEee.slice(0, 4), +asOfEee.slice(5, 7) - 4, 1))) : null;
  // Valores de la ÚLTIMA encuesta (exactamente esa fecha) y de la de 3 meses antes.
  const at = (ser, d) => (d ? (ser || []).find((p) => p.d === d)?.v ?? null : null);
  const row = (label, ser) => [label, at(ser, asOfEee), at(ser, prevM)];
  // Años de "diciembre de cada año" que pregunta la última encuesta (la EEE de nov ya no pregunta por el año en curso).
  const yearsAsked = (prefix, map) => [y0, y0 + 1, y0 + 2].filter((y) => at(map[`${prefix}${y}.M`], asOfEee) != null).slice(0, 2);
  const expectations = asOfEee
    ? [{
        title: 'Encuesta de Expectativas Económicas (EEE, mediana)',
        columns: ['Variable', 'Última', 'Hace 3 meses'],
        rows: [
          row('Inflación en 11 meses (a/a)', eeeInf11),
          row('Inflación en 23 meses (a/a)', EI[S.eeeInf23]),
          ...yearsAsked('F089.IPC.V12.', EI).map((y) => row(`Inflación diciembre ${y}`, EI[`F089.IPC.V12.${y}.M`])),
          row('TPM dentro de 11 meses', eeeTpm11),
          row('TPM dentro de 23 meses', ET['F089.TPM.TAS.15.M']),
          ...yearsAsked('F089.PIB.V12.', EP).map((y) => row(`PIB ${y} (var. %)`, EP[`F089.PIB.V12.${y}.M`])),
        ],
        asOf: asOfEee,
        source: 'BCCh – EEE',
        url: bdeUrl(C.eeeInf),
      }]
    : [];

  return {
    id: 'cl',
    name: 'Chile',
    flag: '🇨🇱',
    currency: 'CLP',
    kpis: [
      kpi({ key: 'policy', group: 'policy', label: 'Tasa de política monetaria', series: tpm, changeDays: 365, ...src(C.tasas, S.tpm) }),
      kpi({ key: 'cpi', group: 'inflation', label: 'IPC a/a', series: ipc, decimals: 1, changeDays: 365, ...src(C.ipc, S.ipc) }),
      kpi({ key: 'exp_cpi', group: 'expectations', label: 'Inflación esperada en 11 meses (EEE)', series: eeeInf11, decimals: 1, ...src(C.eeeInf, S.eeeInf11) }),
      kpi({ key: 'exp_rate', group: 'expectations', label: 'TPM esperada en 11 meses (EEE)', series: eeeTpm11, ...src(C.eeeTpm, 'F089.TPM.TAS.14.M') }),
      kpi({ key: 'eof_tpm', group: 'expectations', label: 'TPM esperada 12m (operadores, EOF)', series: eofTpm12, ...src(C.eofTpm, S.eofTpm12) }),
      kpi({ key: 'be10', group: 'expectations', label: 'Inflación implícita 10Y (BCP − BCU)', series: be10, note: 'Compensación inflacionaria: (1+BCP)/(1+BCU) − 1', source: `Cálculo propio (BCCh ${via})`, url: bdeUrl(C.tasas) }),
      kpi({ key: 'y2', group: 'market', label: 'BCP 2 años', series: bcp2, changeDays: 30, ...src(C.tasas, S.bcp2) }),
      kpi({ key: 'y10', group: 'market', label: 'BCP 10 años', series: bcp10, changeDays: 30, ...src(C.tasas, S.bcp10) }),
      kpi({ key: 'real10', group: 'market', label: 'BCU 10 años (real, UF)', series: bcu10, changeDays: 30, ...src(C.tasas, S.bcu10) }),
      kpi({ key: 'fx', group: 'fx', label: 'USD/CLP (dólar observado)', series: usdclp, unit: '', decimals: 2, changeDays: 365, ...src(C.dolar, S.dolar) }),
      kpi({ key: 'imacec', group: 'activity', label: 'Imacec a/a', series: imacec, decimals: 1, source: `BCCh ${via} ${S.imacec} (calc. a/a)`, url: bdeUrl(C.imacec) }),
      kpi({ key: 'ipsa', group: 'activity', label: 'IPSA (cierre mensual)', series: ipsa, unit: '', decimals: 0, ...src(C.bolsa, S.ipsa) }),
    ],
    equity: ech ? { msci: { ticker: 'ECH', label: 'iShares MSCI Chile (ECH, USD)', series: ech, perf: perf(ech) }, local: null } : null,
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'TPM vs IPC a/a',
        unit: '%',
        lines: [{ key: 'tpm', label: 'TPM', step: true }, { key: 'ipc', label: 'IPC a/a' }],
        data: merge({ tpm: thin(tpm), ipc: ipc.filter((p) => p.d >= (tpm[0]?.d || '')) }),
      },
      { id: 'curve', title: 'Bonos del Banco Central: BCP 2Y y 10Y, BCU 10Y', unit: '%', lines: [{ key: 'b2', label: 'BCP 2Y' }, { key: 'b10', label: 'BCP 10Y' }, { key: 'u10', label: 'BCU 10Y (real)' }], data: merge({ b2: bcp2, b10: bcp10, u10: bcu10 }) },
      { id: 'fx', title: 'USD/CLP – dólar observado', unit: '', lines: [{ key: 'v', label: 'USD/CLP' }], data: merge({ v: usdclp }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: 'TPM vs esperada (EEE 11 meses y operadores 12 meses)',
        unit: '%',
        lines: [{ key: 'tpm', label: 'TPM', step: true }, { key: 'eee', label: 'EEE 11 meses' }, { key: 'eof', label: 'EOF 12 meses' }],
        data: merge({ tpm: thin(tpm.filter((p) => p.d >= from1y)), eee: eeeTpm11.filter((p) => p.d >= from1y), eof: eofTpm12.filter((p) => p.d >= from1y) }),
      },
      {
        id: 'exp-cpi',
        group: 'exp',
        title: 'IPC a/a vs inflación esperada (EEE 11 meses y operadores 12 meses)',
        unit: '%',
        lines: [{ key: 'ipc', label: 'IPC a/a' }, { key: 'eee', label: 'EEE 11 meses' }, { key: 'eof', label: 'EOF 12 meses' }],
        data: merge({ ipc: ipc.filter((p) => p.d >= iso(daysAgo(800))), eee: eeeInf11.filter((p) => p.d >= iso(daysAgo(800))), eof: eofInf12 }),
      },
    ],
    expectations,
    path: pathPts.length
      ? { title: 'TPM esperada por plazo (Encuesta de Expectativas Económicas)', kind: 'survey', asOf: asOfEee, current: last(tpm)?.v, currentLabel: 'TPM actual', path: pathPts, source: 'BCCh – EEE', url: bdeUrl(C.eeeTpm), note: 'Mediana de los economistas encuestados.' }
      : null,
    calendar: upcoming(meetingEvents('cl')),
    errors,
  };
}
