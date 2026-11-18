// fetch falso que imita el FORMATO de cada API con datos sintéticos.
// Sirve para testear los parsers sin red y para generar datos de ejemplo de la UI.
// Los valores NO son reales.

const DAY = 864e5;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const iso = (t) => new Date(t).toISOString().slice(0, 10);

function walk(start, n, vol, freq = 'D', level = start) {
  const out = [];
  let v = level;
  const now = Date.now();
  for (let i = n; i >= 0; i--) {
    const t = freq === 'M' ? Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - i - 1, 1) : now - i * DAY;
    if (freq === 'D' && [0, 6].includes(new Date(t).getUTCDay())) continue;
    v = v * (1 + rnd() * vol);
    out.push({ d: iso(t), v });
  }
  return out;
}
function steps(levels, n) {
  const out = [];
  const now = Date.now();
  for (let i = n; i >= 0; i--) {
    const t = now - i * DAY;
    if ([0, 6].includes(new Date(t).getUTCDay())) continue;
    out.push({ d: iso(t), v: levels[Math.min(levels.length - 1, Math.floor(((n - i) / n) * levels.length))] });
  }
  return out;
}
function index(level, n, yoy) {
  const out = [];
  const now = new Date();
  for (let i = n; i >= 0; i--) {
    const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i - 1, 1);
    out.push({ d: iso(t), v: level * Math.pow(1 + yoy / 100, (n - i) / 12) * (1 + rnd() * 0.002) });
  }
  return out;
}
const dmy = (d) => d.split('-').reverse().join('/');
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const text = (s) => new Response(s, { status: 200 });

// niveles plausibles por serie (ilustrativos)
const SGS = {
  432: () => steps([15, 15, 14.5, 14, 13.75], 730),
  13522: () => walk(5, 36, 0.03, 'M', 4.6),
  433: () => walk(0.3, 12, 0.3, 'M', 0.3),
  1: () => walk(5.5, 400, 0.006),
  13621: () => walk(350000, 400, 0.002),
  24369: () => walk(6, 24, 0.02, 'M', 5.8),
  1178: () => steps([14.9, 13.65], 400),
};
const FRED = {
  DFEDTARU: () => steps([4.5, 4.25, 4.0, 3.75], 1100),
  DFEDTARL: () => steps([4.25, 4.0, 3.75, 3.5], 1100),
  EFFR: () => steps([3.83, 3.64], 400),
  CPIAUCSL: () => index(300, 40, 2.9),
  CPILFESL: () => index(310, 40, 3.0),
  PCEPILFE: () => index(120, 40, 2.7),
  DGS2: () => walk(3.6, 400, 0.01),
  DGS10: () => walk(4.2, 400, 0.008),
  T5YIE: () => walk(2.4, 400, 0.01),
  UNRATE: () => walk(4.3, 26, 0.02, 'M'),
};
const ECB = {
  DFR: () => steps([2.25, 2.0, 2.0, 2.25], 1100),
  '000000': () => walk(2.2, 36, 0.05, 'M'),
  XEF000: () => walk(2.4, 36, 0.03, 'M'),
  'SP00.A': () => walk(1.14, 400, 0.004),
  EU000A2X2A25: () => walk(1.92, 120, 0.002),
  SR_2Y: () => walk(2.1, 400, 0.01),
  SR_10Y: () => walk(2.8, 400, 0.008),
  UNEHRT: () => walk(6.3, 26, 0.01, 'M'),
  'LT.Q.AVG': () => [['2024-Q1', 2.0], ['2024-Q2', 2.0], ['2024-Q3', 2.0], ['2024-Q4', 2.02], ['2025-Q1', 2.0], ['2025-Q2', 2.03], ['2025-Q3', 2.02], ['2025-Q4', 2.05], ['2026-Q1', 2.04], ['2026-Q2', 2.06], ['2026-Q3', 2.08]].map(([d, v]) => ({ d, v })),
};
const SIE = {
  SF61745: () => steps([7.0, 6.75, 6.5, 6.25], 1100),
  SF43718: () => walk(18.5, 1100, 0.005),
  SF43936: () => walk(6.3, 1100, 0.004),
  SF43783: () => walk(6.5, 1100, 0.003),
  SP30578: () => walk(3.8, 36, 0.04, 'M'),
};
const VALET = {
  V39079: () => steps([2.75, 2.5, 2.25], 1100),
  'AVG.INTWO': () => walk(2.24, 120, 0.001),
  FXUSDCAD: () => walk(1.38, 400, 0.003),
  'BD.CDN.2YR.DQ.YLD': () => walk(2.6, 400, 0.01),
  'BD.CDN.10YR.DQ.YLD': () => walk(3.3, 400, 0.008),
  V41690973: () => index(160, 50, 2.2),
  CPI_TRIM: () => walk(2.8, 36, 0.03, 'M'),
  CPI_MEDIAN: () => walk(2.9, 36, 0.03, 'M'),
};
const YLEVEL = { EWZ: 30, '^BVSP': 150000, EUSA: 110, '^GSPC': 6700, EZU: 58, '^STOXX50E': 5600, EWW: 64, '^MXX': 62000, EWC: 48, '^GSPTSE': 30000, ACWI: 140, URTH: 180, EEM: 52, ILF: 30, '^N225': 48000, '^VIX': 17, '^TNX': 4.2, '^IRX': 3.6, 'DX-Y.NYB': 99, 'EURUSD=X': 1.15, 'BRL=X': 5.4, 'MXN=X': 18.4, 'CAD=X': 1.39, 'BZ=F': 64, 'GC=F': 4000, 'HG=F': 5, 'ZS=F': 1100, COLO: 27, 'ICOLCAP.CL': 15000, 'COP=X': 3900 };

export async function mockFetch(input) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const u = url.toString();

  if (url.host === 'api.bcb.gov.br') {
    const code = Number(u.match(/sgs\.(\d+)/)[1]);
    return json((SGS[code] || (() => []))().map((p) => ({ data: dmy(p.d), valor: p.v.toFixed(2) })));
  }
  if (url.host === 'olinda.bcb.gov.br') {
    const d1 = iso(Date.now() - 4 * DAY), d0 = iso(Date.now() - 11 * DAY);
    if (u.includes('Inflacao12Meses')) {
      return json({ value: walk(4.1, 400, 0.008).map((p) => ({ Data: p.d, Mediana: +p.v.toFixed(2) })) });
    }
    if (decodeURIComponent(u).includes('Data ge')) {
      const value = [];
      const lv = { IPCA: 4.0, Selic: 12.25, 'Câmbio': 5.55 };
      for (const [ind, l] of Object.entries(lv)) walk(l, 400, ind === 'Selic' ? 0.004 : 0.005).forEach((p) => value.push({ Indicador: ind, Data: p.d, Mediana: +p.v.toFixed(2) }));
      return json({ value });
    }
    if (u.includes('ExpectativasMercadoSelic')) {
      const value = [];
      for (const d of [d1, d0]) ['R8/2026', 'R1/2027', 'R2/2027', 'R3/2027', 'R4/2027', 'R5/2027', 'R6/2027', 'R7/2027', 'R8/2027'].forEach((r, i) => value.push({ Data: d, Reuniao: r, Mediana: 13.75 - Math.min(i, 5) * 0.25 }));
      return json({ value });
    }
    const y = new Date().getUTCFullYear();
    const base = { IPCA: [4.4, 4.0, 3.6], Selic: [13.5, 12.25, 11], 'Câmbio': [5.45, 5.55, 5.6], 'PIB Total': [2.1, 1.7, 1.9] };
    const value = [];
    for (const [ind, vals] of Object.entries(base)) vals.forEach((m, i) => value.push({ Indicador: ind, Data: d1, DataReferencia: String(y + i), Mediana: m }));
    return json({ value });
  }
  if (url.host === 'servicodados.ibge.gov.br') {
    return json({ items: [{ nome_produto: 'IPCA-15', data_divulgacao: dmy(iso(Date.now() + 8 * DAY)) + ' 09:00:00' }, { nome_produto: 'Sistema de Contas Nacionais Trimestrais (PIB)', data_divulgacao: dmy(iso(Date.now() + 15 * DAY)) + ' 09:00:00' }] });
  }
  if (url.host === 'api.stlouisfed.org') {
    if (u.includes('/releases/dates')) {
      return json({ release_dates: [
        { release_id: 10, release_name: 'Consumer Price Index', date: iso(Date.now() + 20 * DAY) },
        { release_id: 50, release_name: 'Employment Situation', date: iso(Date.now() + 16 * DAY) },
        { release_id: 54, release_name: 'Personal Income and Outlays', date: iso(Date.now() + 9 * DAY) },
        { release_id: 999, release_name: 'Something Irrelevant', date: iso(Date.now() + 3 * DAY) },
      ] });
    }
    const id = url.searchParams.get('series_id');
    return json({ observations: (FRED[id] || (() => []))().map((p) => ({ date: p.d, value: p.v.toFixed(3) })) });
  }
  if (url.host === 'data-api.ecb.europa.eu') {
    if (u.includes('.IF_') && u.includes('startPeriod')) {
      return text('KEY,FREQ,TITLE,TIME_PERIOD,OBS_VALUE\n' + walk(2.0, 400, 0.01).map((p) => `K,B,x,${p.d},${p.v.toFixed(4)}`).join('\n') + '\n');
    }
    if (u.includes('.IF_')) {
      const t = u.match(/IF_(\w+)/)[1];
      const v = { '3M': 2.0, '6M': 1.98, '9M': 1.97, '1Y': 2.0, '18M': 2.08, '2Y': 2.18 }[t];
      return text(`KEY,FREQ,TITLE,TIME_PERIOD,OBS_VALUE\nYC.B.X,B,"Forward, ${t}",${iso(Date.now() - DAY)},${v}\n`);
    }
    const k = Object.keys(ECB).find((x) => u.includes(x));
    const rows = (ECB[k] || (() => []))();
    const per = (d) => (k === 'LT.Q.AVG' ? d : ['000000', 'XEF000', 'UNEHRT'].includes(k) ? d.slice(0, 7) : d);
    return text('KEY,FREQ,TITLE_COMPL,TIME_PERIOD,OBS_VALUE\n' + rows.map((p) => `K,D,"Serie, con coma",${per(p.d)},${p.v.toFixed(4)}`).join('\n') + '\n');
  }
  if (url.host === 'www.banxico.org.mx') {
    const ids = u.match(/series\/([^/]+)\/datos/)[1].split(',');
    return json({ bmx: { series: ids.map((id) => ({ idSerie: id, titulo: id, datos: (SIE[id] || (() => []))().map((p) => ({ fecha: dmy(p.d), dato: p.v.toFixed(4) })) })) } });
  }
  if (url.host === 'www.bankofcanada.ca') {
    const id = decodeURIComponent(u.match(/observations\/([^/]+)\/json/)[1]);
    return json({ observations: (VALET[id] || (() => []))().map((p) => ({ d: p.d, [id]: { v: p.v.toFixed(4) } })) });
  }
  if (url.host === 'query1.finance.yahoo.com') {
    const t = decodeURIComponent(u.match(/chart\/([^?]+)/)[1]);
    let s;
    const zq = t.match(/^ZQ([A-Z])(\d\d)\.CBT$/);
    if (zq) {
      const months = 'FGHJKMNQUVXZ'.indexOf(zq[1]) + Number(zq[2]) * 12 - ((new Date().getUTCFullYear() % 100) * 12 + new Date().getUTCMonth());
      const target = 100 - (3.64 - Math.min(months, 8) * 0.04);
      s = u.includes('range=1y') ? walk(target, 370, 0.0004).map((p, i, a) => ({ d: p.d, v: p.v + (a.length - i) * 0.0012 })) : [{ d: iso(Date.now() - DAY), v: target }];
    } else if (YLEVEL[t]) s = walk(YLEVEL[t], 370, 0.01);
    else return new Response('{"chart":{"result":null}}', { status: 404 });
    return json({ chart: { result: [{ meta: { regularMarketPrice: s[s.length - 1].v, regularMarketTime: Date.parse(s[s.length - 1].d) / 1000 }, timestamp: s.map((p) => Date.parse(p.d) / 1000), indicators: { quote: [{ close: s.map((p) => p.v) }] } }] } });
  }
  if (url.host === 'www.datos.gov.co') {
    return json(walk(3900, 400, 0.005).map((p) => ({ valor: p.v.toFixed(2), vigenciadesde: p.d + 'T00:00:00.000' })));
  }
  if (url.host === 'totoro.banrep.gov.co') {
    if (u.includes('/dataflow/')) {
      return text(`<mes:Structure><mes:Structures><str:Dataflows>
        <str:Dataflow id="DF_TRM_DAILY_HIST" agencyID="ESTAT" version="1.0"><com:Name xml:lang="es">Tasa Representativa del Mercado (TRM) histórico</com:Name></str:Dataflow>
        <str:Dataflow id="DF_CBR_DAILY_HIST" agencyID="ESTAT" version="1.0"><com:Name xml:lang="es">Tasa de política monetaria histórico</com:Name></str:Dataflow>
      </str:Dataflows></mes:Structures></mes:Structure>`);
    }
    const ser = (key, rows, fmt = (d) => d.replace(/-/g, '')) =>
      `<generic:Series><generic:SeriesKey>${key.split('.').map((v, i) => `<generic:Value id="D${i}" value="${v}"/>`).join('')}</generic:SeriesKey>` +
      rows.map((p) => `<generic:Obs><generic:ObsDimension value="${fmt(p.d)}"/><generic:ObsValue value="${p.v.toFixed(4)}"/></generic:Obs>`).join('') + '</generic:Series>';
    let body = '';
    // Claves con el formato real de BanRep: CO.<SUBJECT>._Z._Z._Z.<UNIDAD>.<FREQ>
    const k = (subj, unit, f = 'D') => `CO.${subj}._Z._Z._Z.${unit}.${f}`;
    if (u.includes('DF_IBR')) {
      body = ['00', '01', '03', '06'].map((m, i) => ser(k(`IRIBRM${m}`, 'ER'), walk(12.2 + i * 0.05, 400, 0.002)) + ser(k(`IRIBRM${m}`, 'NR'), walk(11.4 + i * 0.05, 400, 0.002))).join('');
    } else if (u.includes('DF_CBR')) body = ser(k('IRCBRM01', 'PA'), steps([9.25, 10.25, 11.25, 12.0, 12.25], 1100));
    else if (u.includes('DF_UVR')) {
      // UVR diaria (incluye fechas futuras, como la real) creciendo ~0,45% mensual.
      const uvr = [];
      for (let t = Date.now() - 1500 * DAY, v = 350; t < Date.now() + 40 * DAY; t += DAY) uvr.push({ d: iso(t), v: (v *= 1 + 0.00015 * (1 + rnd() * 0.2)) });
      body = ser(k('RVU', 'APC'), uvr.map((p) => ({ d: p.d, v: 5.5 }))) + ser(k('RVU', 'CRVU'), uvr);
    } else if (u.includes('DF_TES')) {
      body = ['10', '01', '05'].map((y) => ser(k(`IRGBRY${y}`, 'PT', 'M'), walk(0.12 + Number(y) / 1000, 24, 0.02, 'M'), (d) => d.replace(/-/g, ''))).join('');
    }
    else if (u.includes('DF_TRM')) body = ser('TRM', walk(3900, 400, 0.005));
    return text(`<message:GenericData><message:DataSet>${body}</message:DataSet></message:GenericData>`);
  }
  return new Response('not mocked: ' + u, { status: 404 });
}
