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
  ...Object.fromEntries(['DGS1MO', 'DGS3MO', 'DGS6MO', 'DGS1', 'DGS3', 'DGS5', 'DGS7', 'DGS20', 'DGS30'].map((id, i) => [id, () => walk(3.6 + i * 0.12, 20, 0.004)])),
  DFEDTARU: () => steps([4.5, 4.25, 4.0, 3.75], 1100),
  // India (OCDE vía FRED, mensuales).
  IRSTCI01INM156N: () => walk(5.4, 36, 0.01, 'M'),
  INDIR3TIB01STM: () => walk(5.7, 36, 0.01, 'M'),
  INDIRLTLT01STM: () => walk(6.5, 36, 0.005, 'M'),
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
  SF43883: () => walk(8.0, 30, 0.02, 'M'),
  SF44071: () => walk(9.2, 30, 0.02, 'M'),
};
// Encuesta Banxico (mensual): cualquier SR… devuelve una serie mensual plausible.
const SIE_SURVEY_LEVEL = (id) => (['SR14770', 'SR14777'].includes(id) ? 18.5 : ['SR14448', 'SR14455'].includes(id) ? 1.5 : /^SR14(6|7)/.test(id) ? 6.5 : 3.8);
const VALET = {
  V39079: () => steps([2.75, 2.5, 2.25], 1100),
  'AVG.INTWO': () => walk(2.24, 120, 0.001),
  FXUSDCAD: () => walk(1.38, 400, 0.003),
  'BD.CDN.2YR.DQ.YLD': () => walk(2.6, 400, 0.01),
  'BD.CDN.10YR.DQ.YLD': () => walk(3.3, 400, 0.008),
  V41690973: () => index(160, 50, 2.2),
  CPI_TRIM: () => walk(2.8, 36, 0.03, 'M'),
  CPI_MEDIAN: () => walk(2.9, 36, 0.03, 'M'),
  'BD.CDN.LONG.DQ.YLD': () => walk(3.9, 400, 0.006),
  'BD.CDN.RRB.DQ.YLD': () => walk(1.8, 400, 0.008),
};
const YLEVEL = { EWZ: 30, '^BVSP': 150000, EUSA: 110, '^GSPC': 6700, EZU: 58, '^STOXX50E': 5600, EWW: 64, '^MXX': 62000, EWC: 48, '^GSPTSE': 30000, ACWI: 140, URTH: 180, EEM: 52, ILF: 30, '^N225': 48000, '^VIX': 17, '^TNX': 4.2, '^IRX': 3.6, 'DX-Y.NYB': 99, 'EURUSD=X': 1.15, 'BRL=X': 5.4, 'MXN=X': 18.4, 'CAD=X': 1.39, 'BZ=F': 64, 'GC=F': 4000, 'HG=F': 5, 'ZS=F': 1100, COLO: 27, 'ICOLCAP.CL': 15000, 'COP=X': 3900, EWJ: 80, 'JPY=X': 150, ECH: 30, ARGT: 70 };

/** XLSX mínimo (ZIP sin compresión) con una hoja y textos compartidos, para imitar planillas reales. */
function mockXlsx(rows) {
  const strings = [];
  const si = (t) => { let k = strings.indexOf(t); if (k < 0) { strings.push(t); k = strings.length - 1; } return k; };
  const col = (i) => String.fromCharCode(65 + i);
  const sheet = '<worksheet><sheetData>' + rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) =>
    /^-?\d+(\.\d+)?$/.test(v) ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${si(v)}</v></c>`).join('') + '</row>').join('') + '</sheetData></worksheet>';
  const sst = '<sst>' + strings.map((t) => `<si><t>${t}</t></si>`).join('') + '</sst>';
  const files = [['xl/worksheets/sheet1.xml', sheet], ['xl/sharedStrings.xml', sst]].map(([n, c]) => [Buffer.from(n), Buffer.from(c)]);
  const parts = [], central = [];
  let off = 0;
  for (const [name, data] of files) {
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, data); central.push(ch, name);
    off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

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
    // Nombres reales del calendario del IBGE (nombre completo, no la sigla).
    const it = (n, k) => ({ nome_produto: n, data_divulgacao: dmy(iso(Date.now() + k * DAY)) + ' 09:00:00' });
    return json({ items: [it('Índice Nacional de Preços ao Consumidor Amplo 15', 8), it('Índice Nacional de Preços ao Consumidor Amplo', 22), it('Índice Nacional de Preços ao Consumidor', 22), it('Sistema de Contas Nacionais Trimestrais', 15)] });
  }
  if (url.host === 'api.stlouisfed.org') {
    if (u.includes('/release/dates')) {
      // Formato real: una fecha por release consultado (sin release_name).
      const rid = Number(url.searchParams.get('release_id'));
      const off = { 10: 20, 50: 16, 54: 9 }[rid];
      return json({ release_dates: off ? [{ release_id: rid, date: iso(Date.now() + off * DAY) }] : [] });
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
    const gen = (id) => SIE[id] || (id.startsWith('SR') ? () => walk(SIE_SURVEY_LEVEL(id), 26, 0.01, 'M') : () => []);
    return json({ bmx: { series: ids.map((id) => ({ idSerie: id, titulo: id, datos: gen(id)().map((p) => ({ fecha: dmy(p.d), dato: p.v.toFixed(4) })) })) } });
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
    else if (t === 'NOEXISTE') return new Response('{"chart":{"result":null}}', { status: 404 });
    else s = walk(100, 370, 0.01); // resto de los tickers de Mundo: nivel genérico
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
  if (url.host === 'api.bcra.gob.ar') {
    // API de estadísticas v4 del BCRA: results[0].detalle = [{fecha, valor}] (de la más nueva a la más vieja).
    const id = Number(u.match(/monetarias\/(\d+)/)[1]);
    const lv = { 1: 45000, 5: 1500, 7: 23, 44: 24, 150: 20, 27: 2, 28: 33, 29: 22, 1187: 700, 1188: 1950 }[id] ?? 10;
    const monthly = [27, 28, 29].includes(id);
    const s = monthly ? walk(lv, 30, 0.02, 'M') : walk(lv, 500, 0.003);
    return json({ status: 200, results: [{ idVariable: id, detalle: s.reverse().map((p) => ({ fecha: p.d, valor: p.v })) }] });
  }
  if (url.host === 'www.bcra.gob.ar') {
    if (u.endsWith('.xlsx')) {
      // Planilla del REM: título de sección en la col. B, filas con período (serial Excel o texto), referencia y mediana.
      const ser = (d) => String(Math.round((Date.parse(d) - Date.UTC(1899, 11, 30)) / DAY));
      const y = new Date().getUTCFullYear();
      const months = walk(1, 6, 0, 'M').map((p) => ser(p.d));
      const sec = (t, ref, lvl) => [['', t], ['', 'Período', 'Referencia', 'Mediana'], ...months.map((m) => ['', m, ref, String(lvl)]), ['', 'próx. 12 meses', ref, String(lvl * 1.1)], ['', 'próx. 24 meses', ref, String(lvl * 0.9)], ['', String(y), ref, String(lvl)], ['', String(y + 1), ref, String(lvl * 0.8)]];
      const rows = [['', 'Relevamiento de Expectativas'], ...sec('Precios minoristas (IPC nivel general; INDEC)', 'var. %', 1.8), ...sec('Precios minoristas (IPC núcleo; INDEC)', 'var. %', 1.7),
        ...sec('Tasa de interés (TAMAR)', 'TNA; %', 24), ...sec('Tipo de cambio nominal', '$/USD', 1600), ...sec('PIB a precios constantes', 'var. %', 2), ['', 'Fuente: REM - BCRA (oct-26)']];
      return new Response(mockXlsx(rows), { status: 200 });
    }
    return text('<a href="/archivos/Pdfs/PublicacionesEstadisticas/informes/relevamiento-expectativas-mercado-tablas-2026-10.xlsx">Tablas</a>');
  }
  if (url.host === 'apis.datos.gob.ar') {
    // API de series de tiempo de Argentina: data = [[fecha, v1, v2, ...]] mensual.
    const ids = url.searchParams.get('ids').split(',');
    const rows = walk(1, 48, 0, 'M').map((p, i) => [p.d, ...ids.map((id, k) => (k === 0 ? 1.2e6 : 0.2e6) * 1.03 ** i * (1 + Math.sin(i / 3 + k) * 0.5))]);
    return json({ data: rows, meta: [] });
  }
  if (url.host === 'ec.europa.eu') {
    // Eurostat JSON-stat: dimension.time.category.index + value por posición.
    const qs = ['2023-Q1', '2023-Q2', '2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1', '2025-Q2'];
    const isDebt = u.includes('ggdebt');
    return json({ dimension: { time: { category: { index: Object.fromEntries(qs.map((q, i) => [q, i])) } } }, value: Object.fromEntries(qs.map((q, i) => [String(i), isDebt ? 88 + i * 0.1 : -3 + Math.sin(i) * 0.5])) });
  }
  if (url.host === 'api.imf.org') {
    // SDMX-JSON 3.0 del WEO: dimensiones COUNTRY/INDICATOR/FREQUENCY y observaciones por índice de año.
    const key = decodeURIComponent(u.match(/WEO\/\+\/([^?]+)/)[1]).split('.');
    const cs = key[0].split('+'), inds = key[1].split('+');
    const years = Array.from({ length: 2031 - 2004 + 1 }, (_, i) => String(2004 + i));
    const base = { BCA_NGDPD: -1.5, GGXCNL_NGDP: -3, GGXONLB_NGDP: 0.5, GGXWDG_NGDP: 60, NGSD_NGDP: 20, NID_NGDP: 21.5, NGDP: 1000, NGDP_RPCH: 2, PCPIPCH: 3, PCPIEPCH: 2.8 };
    const series = {};
    cs.forEach((c, ci) => inds.forEach((ind, ii) => {
      series[`${ci}:${ii}:0`] = {
        attributes: [0, 0, 0, '9/30/2026'],
        observations: Object.fromEntries(years.map((y, t) => [t, [String(ind === 'NGDP' ? base.NGDP * 1.07 ** t : base[ind] + Math.sin(t / 3 + ci) * (ind === 'GGXWDG_NGDP' ? 8 : 1))]])),
      };
    }));
    return json({ data: { structures: [{ dimensions: { series: [{ id: 'COUNTRY', values: cs.map((id) => ({ id })) }, { id: 'INDICATOR', values: inds.map((id) => ({ id })) }, { id: 'FREQUENCY', values: [{ id: 'A' }] }],
      observation: [{ id: 'TIME_PERIOD', values: years.map((value) => ({ value })) }] }, attributes: { series: [{ id: 'SCALE' }, { id: 'DECIMALS_DISPLAYED' }, { id: 'OVERLAP' }, { id: 'COUNTRY_UPDATE_DATE' }] } }],
      dataSets: [{ series }] } });
  }
  if (url.host === 'api.worldbank.org') {
    const codes = u.match(/country\/([^/]+)\/indicator/)[1].split(';');
    const rows = codes.flatMap((c, i) => Array.from({ length: 21 }, (_, k) => ({ countryiso3code: c, date: String(2005 + k), value: 2 + Math.sin(k / 4 + i) * 3 })));
    return json([{ page: 1, lastupdated: '2026-11-11' }, rows]);
  }
  if (url.host === 'si3.bcentral.cl') {
    // Cuadro de la BDE (HTML): encabezados con fechas ("17.Nov.2026" o "Nov.2026") y una fila por serie (data-serie).
    const M = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const daily = /TPMyTASAS|DOLAR_OBS|EXE_EOF/.test(u);
    const pts = daily ? walk(1, 300, 0) : walk(1, 40, 0, 'M');
    const head = pts.map((p) => { const [y, m, d] = p.d.split('-'); return daily ? `${Number(d)}.${M[+m - 1]}.${y}` : `${M[+m - 1]}.${y}`; });
    const y0 = new Date().getUTCFullYear();
    const lv = (c) => (/TCO/.test(c) ? 950 : /IBC/.test(c) ? 9000 : /IMC\.IND/.test(c) ? 110 : /BUF/.test(c) ? 2.5 : /BCLP/.test(c) ? 5.5 : /TPM/.test(c) ? 4.5 : /PIB/.test(c) ? 2 : 3.5);
    const codes = ['F022.TPM.TIN.D001.NO.Z.D', 'F022.BCLP.TIS.AN02.NO.Z.D', 'F022.BCLP.TIS.AN10.NO.Z.D', 'F022.BUF.TIS.AN10.UF.Z.D', 'F073.TCO.PRE.Z.D',
      'F074.IPC.IND.Z.EP09.C.M', 'F013.IBC.IND.N.7.LAC.CL.CLP.BLO.M', 'F032.IMC.IND.Z.Z.EP18.Z.Z.0.M', 'F089.IPC.V12.14.M', 'F089.IPC.V12.15.M',
      'F089.EOF.VII.12MS.D', 'F089.EOF.TPM.12MS.D', ...['11', '31', '26', '14', '30', '15', '35'].map((k) => `F089.TPM.TAS.${k}.M`),
      ...[y0, y0 + 1].flatMap((y) => [`F089.IPC.V12.${y}.M`, `F089.PIB.V12.${y}.M`])];
    const fmt = (v) => v.toFixed(2).replace('.', ',');
    const rows = codes.map((c, k) => `<tr><td><input data-serie="${c}" /></td><td><span class="sname">${c}</span></td>` +
      pts.map((p, i) => `<td class="ar col">${fmt(lv(c) * (1 + Math.sin(i / 15 + k) * 0.03))}</td>`).join('') + '</tr>').join('');
    return text(`<table><tr><th>Sel.</th><th>Serie</th>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows}</table>`);
  }
  if (url.host === 'cdn.bancentral.gov.do') {
    // Planilla EMBI del BCRD: misma estructura (título, fila "Fecha", fechas seriales de Excel, valores en pp, "N/A").
    const head = ['Fecha', 'Global', 'LATINO', 'REP DOM', 'Argentina', 'Brasil', 'Chile', 'Colombia', 'México', 'Perú', 'Venezuela'];
    const lv = [2.0, 2.1, 1.9, 7.5, 2.0, 1.0, 2.3, 2.2, 1.2, 50];
    const rows = [['EMBI Global Diversified Subindices'], head];
    const n = 900;
    for (let i = n; i >= 0; i--) {
      const t = Date.now() - i * DAY;
      if ([0, 6].includes(new Date(t).getUTCDay())) continue;
      rows.push([String(Math.round((t - Date.UTC(1899, 11, 30)) / DAY)), ...lv.map((v, k) => (k === 9 && i > 600 ? 'N/A' : String(v * (1 + Math.sin(i / 40 + k) * 0.1))))]);
    }
    return new Response(mockXlsx(rows), { status: 200 });
  }
  if (url.host === 'api.onvista.de') {
    // Snapshot de un bono soberano en USD: rendimiento creciente con el plazo según el ISIN (determinístico).
    const isin = decodeURIComponent(u.match(/ISIN:([A-Z0-9]+)/)[1]);
    const h = [...isin].reduce((a, c) => a + c.charCodeAt(0), 0);
    const years = 1 + (h % 28);
    const mat = new Date(Date.now() + years * 365.25 * DAY).toISOString();
    const ytm = 5 + (h % 4) + years * 0.08;
    return json({
      bondsDetails: { officialName: `Bono ${isin}`, isoCurrency: 'USD', coupon: 5 + (h % 5), nameTypeCoupon: 'Fest' },
      bondsBaseData: { datetimeMaturity: mat, perpetual: false, inDefault: false },
      bondsIssuer: { isoCountry: 'XX', nameTypeIssuer: 'öffentlich' },
      bondsFigures: { priceForCalculation: 95 + (h % 10), datetimePriceForCalculation: new Date(Date.now() - DAY).toISOString(), yieldToMaturity: ytm, modifyDuration: Math.min(years * 0.8, 15) },
      quote: { last: 96 },
    });
  }
  if (url.host === 'www.tesourotransparente.gov.br') {
    // CSV del Tesouro Direto: fechas de la más nueva a la más vieja (como el real), separador ';' y coma decimal.
    const y0 = new Date().getUTCFullYear();
    const bonds = [
      ['Tesouro Prefixado', `01/01/${y0 + 1}`, 13.6], ['Tesouro Prefixado', `01/01/${y0 + 2}`, 14.4], ['Tesouro Prefixado', `01/01/${y0 + 3}`, 14.9],
      ['Tesouro Prefixado com Juros Semestrais', `01/01/${y0 + 7}`, 15.3], ['Tesouro Prefixado com Juros Semestrais', `01/01/${y0 + 11}`, 15.2],
      ['Tesouro IPCA+ com Juros Semestrais', `15/05/${y0 + 9}`, 7.7], ['Tesouro IPCA+', `15/08/${y0 + 12}`, 7.6],
    ];
    const lines = ['Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha'];
    for (const p of walk(1, 500, 0.002).reverse()) for (const [t, v, r] of bonds) lines.push(`${t};${v};${dmy(p.d)};${(r * p.v).toFixed(2).replace('.', ',')};0;0;0;0`);
    return text(lines.join('\r\n'));
  }
  if (url.host === 'www.stat-search.boj.or.jp') {
    const code = url.searchParams.get('code');
    const s = code.startsWith('TK') ? walk(2.5, 12, 0.02, 'M').filter((_, i) => i % 3 === 0) : steps([0.25, 0.5, 0.75, 1.0], 1100);
    const fmt = code.startsWith('TK') ? (d) => Number(d.slice(0, 4) + '0' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1)) : (d) => Number(d.replace(/-/g, ''));
    return json({ STATUS: 200, RESULTSET: [{ SERIES_CODE: code, FREQUENCY: code.startsWith('TK') ? 'QUARTERLY' : 'DAILY', VALUES: { SURVEY_DATES: s.map((p) => fmt(p.d)), VALUES: s.map((p) => +p.v.toFixed(3)) } }] });
  }
  if (url.host === 'www.mof.go.jp') {
    const rows = walk(1, 420, 0.004).map((p) => `${p.d.replace(/-0?/g, '/')},${[1.6, 1.85, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3.3, 3.6, 3.9, 4.0, 4.0].map((r) => (r * p.v).toFixed(3)).join(',')}`);
    return text(`Interest Rate,,,,,,,,,,,,,,,(Unit : %)\nDate,1Y,2Y,3Y,4Y,5Y,6Y,7Y,8Y,9Y,10Y,15Y,20Y,25Y,30Y,40Y\n${rows.join('\n')}\n`);
  }
  if (url.host === 'stats.bis.org') {
    // Formato real: campos de texto con comas y punto y coma antes de TIME_PERIOD,OBS_VALUE; NaN en feriados.
    const area = u.match(/\/(?:D|M)\.([A-Z]{2})/)[1];
    if (u.includes('WS_CBPOL')) {
      const rows = steps([5.0, 4.75, 4.5, 4.25], 1100).map((p, i) => `D,${area},368,0,,From 3 Apr 2001 onwards: official rate; see notes.,4,Central bank,Notes, with commas, Central bank policy rates - Daily,${p.d},${i % 50 === 7 ? 'NaN' : p.v},A,F,`);
      return text('FREQ,REF_AREA,UNIT_MEASURE,UNIT_MULT,TIME_FORMAT,COMPILATION,DECIMALS,SOURCE_REF,SUPP_INFO_BREAKS,TITLE,TIME_PERIOD,OBS_VALUE,OBS_STATUS,OBS_CONF,OBS_PRE_BREAK\n' + rows.join('\n') + '\n');
    }
    return text('FREQ,REF_AREA,UNIT_MEASURE,UNIT_MULT,TIME_FORMAT,BREAKS,COVERAGE,DECIMALS,TITLE_TS,TIME_PERIOD,OBS_VALUE,OBS_CONF,OBS_PRE_BREAK,OBS_STATUS\n' + walk(2.5, 40, 0.03, 'M').map((p) => `M,${area},771,0,,,,,,${p.d.slice(0, 7)},${p.v.toFixed(3)},F,,A`).join('\n') + '\n');
  }
  if (url.host === 'www.blackrock.com') {
    const pid = Number(url.searchParams.get('portfolioId'));
    if (u.includes('get-product-data')) {
      // Componente fundamentalsAndRisk: objetos { name, formattedValue, value, asOfDate } anidados.
      const f = (name, value) => ({ name, visible: true, formattedValue: String(value), value, asOfDate: Number(iso(Date.now() - DAY).replace(/-/g, '')) });
      return json({ productId: pid, componentsByNameMap: { fundamentalsAndRisk: { containersByNameMap: { default: { attributesByNameMap: {
        priceEarnings: f('priceEarnings', 10 + (pid % 17)), priceBook: f('priceBook', 1 + (pid % 7) / 3), twelveMonTrlYld: f('twelveMonTrlYld', 2 + (pid % 5) / 2), numHoldings: f('numHoldings', 50) } } } } } });
    }
    // Planilla SpreadsheetML: hoja Holdings y luego Historical (de la fecha más nueva a la más vieja).
    const row = (cells) => `<ss:Row>${cells.map((c) => `<ss:Cell><ss:Data ss:Type="String">${c}</ss:Data></ss:Cell>`).join('')}</ss:Row>`;
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const us = (d) => `${M[+d.slice(5, 7) - 1]} ${d.slice(8)}, ${d.slice(0, 4)}`;
    let so = 100e6 + (pid % 13) * 1e6;
    const hist = walk(30, 420, 0.01).map((p, i) => ({ ...p, so: (so += (i % 9 === 0 ? 1 : i % 7 === 0 ? -1 : 0) * 0.4e6) })).reverse();
    return text(`<?xml version="1.0"?><ss:Workbook><ss:Worksheet ss:Name="Holdings"><ss:Table>${row(['Ticker', 'Name'])}${row(['ABC', 'Empresa'])}</ss:Table></ss:Worksheet>`
      + `<ss:Worksheet ss:Name="Historical"><ss:Table>${row(['As Of', 'NAV per Share', 'Ex-Dividends', 'Shares Outstanding', 'Non-FV NAV'])}`
      + hist.map((p) => row([us(p.d), p.v.toFixed(4), '--', String(p.so), p.v.toFixed(4)])).join('') + `</ss:Table></ss:Worksheet></ss:Workbook>`);
  }
  if (url.host === 'worldperatio.com') {
    // Misma estructura que la página real: título, P/E y fecha, ETF, serie mensual (Highcharts) y tabla de estadísticas.
    const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const now = new Date(Date.now() - DAY);
    const date = `${now.getUTCDate()} ${LONG[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
    const hist = walk(12, 260, 0.04, 'M');
    const pe = hist.at(-1).v;
    const row = (y, avg, sd) => `<tr><td><b>Last ${y}Y</b></td><td>${avg}</td><td>${sd}</td><td>[${(avg - 2 * sd).toFixed(2)} · <font>${(avg - sd).toFixed(2)} , ${(avg + sd).toFixed(2)}</font> · ${(avg + 2 * sd).toFixed(2)}]</td>`
      + `<td><div class="pe-range"></div></td><td>${((pe - avg) / sd >= 0 ? '+' : '') + ((pe - avg) / sd).toFixed(2)} &sigma;</td><td><div class="w3-tag">Fair</div></td></tr>`;
    return text(`<html><h1>Test Stock Market: current P/E Ratio</h1><a>Homepage</a><h2>Test Stock Market: current P/E Ratio</h2><span>Test Stock Market</span>`
      + `<span>P/E Ratio</span><span>${pe.toFixed(2)}</span><span>${date}</span><p>P/E Ratio is calculated on the <b>ETF</b> Etf</p>`
      + `<script>detailPE_data = [${hist.map((p) => `[Date.UTC(${p.d.slice(0, 4)}, ${+p.d.slice(5, 7) - 1}, 1),${p.v.toFixed(4)}]`).join(',')}];</script>`
      + `<table>${row(1, 12.5, 0.9)}${row(5, 11.8, 1.6)}${row(10, 12.1, 1.9)}${row(20, 12.4, 2.1)}</table></html>`);
  }
  if (url.host === 'www.msci.com') {
    // PDF mínimo válido (fuente Helvetica, texto sin comprimir) con la leyenda y la sección FUNDAMENTALS del factsheet real.
    const lines = ['CUMULATIVE INDEX PERFORMANCE — NET RETURNS (USD)', '(OCT 2011 – OCT 2026)', 'MSCI Test', 'MSCI Emerging Markets', 'MSCI ACWI', 'ANNUAL PERFORMANCE (%)',
      'FUNDAMENTALS (OCT 30, 2026)', 'Div Yld (%) P/E P/E Fwd P/BV', '5.80 8.89 7.58 1.71', '2.19 13.68 12.10 2.20', '1.61 20.82 15.64 3.71', 'INDEX RISK AND RETURN CHARACTERISTICS'];
    const esc = (x) => x.replace(/[—–]/g, '-').replace(/([()\\])/g, '\\$1');
    const content = `BT /F1 10 Tf 14 TL 40 760 Td ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let pdf = '%PDF-1.4\n';
    const off = objs.map((o, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Response(Buffer.from(pdf, 'latin1'), { status: 200, headers: { 'content-type': 'application/pdf' } });
  }
  if (url.host === 'www.dane.gov.co') {
    // Vista mensual del calendario: links icalrepeat.detail/AAAA/MM/DD/<id>/-/<slug> con el título en <strong>.
    const [, y, m] = u.match(/month\.calendar\/(\d{4})\/(\d{2})/);
    const ev = (d, t) => `<a class="cal_titlelink" href="/index.php/calendario/icalrepeat.detail/${y}/${m}/${d}/1/-/x"><strong> ${t}</strong></a>`;
    return text(`<html>${ev('07', 'Índice de Precios al Consumidor (IPC)')}${ev('07', 'Boletín diario de Precios de Alimentos (SIPSA)')}${ev('17', 'Producto Interno Bruto (PIB)')}${ev('18', 'Indicador de Seguimiento a la Economía (ISE)')}</html>`);
  }
  return new Response('not mocked: ' + u, { status: 404 });
}
