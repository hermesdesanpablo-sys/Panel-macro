// Test offline: reemplaza fetch por mockFetch (formatos reales, datos sintéticos),
// corre todos los adaptadores y verifica que el payload esté completo.
// Además escribe src/mock-data.json para previsualizar la UI con ?mock=1.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mockFetch } from './mock-fetch.mjs';

process.env.FRED_API_KEY ||= 'test';
process.env.BANXICO_TOKEN ||= 'test';
globalThis.fetch = mockFetch;

const { ADAPTERS } = await import('../api/country.js');
const { parseCsv } = await import('../api/_lib/sources/eu.js');

assert.deepEqual(parseCsv('a,b,c\n1,"x, y",3\n'), [['a', 'b', 'c'], ['1', 'x, y', '3']]);

const out = {};
let fails = 0;
for (const [id, fn] of Object.entries(ADAPTERS)) {
  const p = await fn(id === 'pair' ? { a: 'br', b: 'mx' } : {});
  out[id] = { ...p, updatedAt: new Date().toISOString(), mock: true };
  const missing = (p.kpis || []).filter((k) => k.value == null && k.source !== 'Pendiente').map((k) => k.label);
  const problems = [...p.errors.map((e) => `${e.source}: ${e.message}`), ...missing.map((m) => `KPI vacío: ${m}`)];
  if (id === 'sust') {
    if (p.countries.length < 10) problems.push(`solo ${p.countries.length} países`);
    // Identidad de las tres brechas: cuenta corriente = fiscal + privada, en todos los años con dato.
    for (const c of p.countries) for (const r of c.rows) if (r.ca != null && r.fb != null && Math.abs(r.ca - (r.fb + r.priv)) > 0.02) problems.push(`${c.id} ${r.y}: no cierra la identidad`);
    if (p.countries.some((c) => c.summary.debt == null)) problems.push('país sin deuda/PBI');
    const comp = p.countries.filter((c) => c.composition);
    if (comp.length !== p.countries.length - 2) problems.push(`composición de la deuda: ${comp.length} países (esperados todos menos EZ e IN)`);
    const ec = p.countries.find((c) => c.id === 'ec')?.composition;
    // 68.000 M de deuda, 52.000 M externa, PIB 136.000 M; vencimientos: 12 meses × 500 M = 6.000 M (sin las columnas de totales).
    if (!ec || ec.quarter !== '2026-08' || ec.asOf !== '2026-08-31' || Math.abs(ec.total - 50) > 1e-9 || Math.abs(ec.extShare - 52 / 68 * 100) > 1e-9
      || Math.abs(ec.due12m - 6000 / 136000 * 100) > 1e-9 || ec.fxShare !== 100) problems.push('composición de Ecuador (último mes, totales o vencimientos)');
    const ar = p.countries.find((c) => c.id === 'ar')?.composition;
    if (!ar || ar.fxShare !== 25 || Math.abs(ar.extShare - 100 / 3) > 1e-9 || ar.due12m !== 9 || ar.asOf !== '2026-06-30') problems.push('composición: cálculo de participaciones o fecha');
    if (p.countries.find((c) => c.id === 'cl')?.composition?.sector !== 'BC') problems.push('composición: Chile debería usar el presupuestario central');
    console.log(`${problems.length ? '✗' : '✓'} sust: ${p.countries.length} países, ${p.countries[0].rows.length} años`);
    problems.slice(0, 5).forEach((x) => console.log('    ' + x));
    fails += problems.length;
    continue;
  }
  if (id === 'val') {
    const ok = p.funds.filter((f) => f.pe != null && f.flows?.m1 != null && f.cum.length > 100);
    if (ok.length !== p.funds.length) problems.push(`solo ${ok.length}/${p.funds.length} ETF completos`);
    if (p.funds.some((f) => f.ishares?.beta3y?.v == null || f.ishares?.sec30?.v == null)) problems.push('iShares: faltan ratios (beta, SEC)');
    const wpe = p.rows.filter((r) => r.wpe?.pe != null && r.wpe.stats?.y10?.sd > 0 && r.wpe.history.length > 100);
    if (wpe.length !== p.rows.filter((r) => r.cid !== 'world').length) problems.push(`worldperatio: solo ${wpe.length} países completos`);
    const ms = p.rows.filter((r) => r.msci?.peFwd > 0);
    if (ms.length !== p.rows.filter((r) => r.cid !== 'latam').length) problems.push(`MSCI: solo ${ms.length} con P/E forward`);
    if (p.rows.find((r) => r.cid === 'em')?.msci?.peFwd !== 12.1) problems.push('MSCI: fila de Emerging Markets mal asignada');
    const sec = p.sectors?.rows || [];
    if (sec.length !== 12) problems.push(`sectores: ${sec.length} de 12`);
    if (sec.some((r) => r.ssga?.peFwd == null || r.wpe?.stats?.y5 == null || r.flows?.m1 == null)) problems.push('sectores: falta P/E fwd, historia o flujos');
    if ([...p.rows, ...sec].some((r) => r.wpe && !r.wpe.quality?.y5)) problems.push('worldperatio: falta el control de calidad');
    console.log(`${problems.length ? '✗' : '✓'} val: ${p.funds.length} ETF, ${sec.length} sectores, ${wpe.length} con historia de P/E, ${ms.length} con P/E fwd MSCI`);
    problems.forEach((x) => console.log('    ' + x));
    fails += problems.length;
    continue;
  }
  if (id === 'pairs') {
    if (p.cells.length !== p.countries.length * (p.countries.length - 1)) problems.push(`matriz: ${p.cells.length} celdas`);
    if (p.cells.some((c) => c.zPrice == null)) problems.push('matriz: falta el z de precio');
    const ab = p.cells.find((c) => c.a === 'br' && c.b === 'mx'), ba = p.cells.find((c) => c.a === 'mx' && c.b === 'br');
    if (ab?.zPe != null && Math.abs(ab.zPe + ba.zPe) > 0.5) problems.push('matriz: el par invertido debería tener z de signo opuesto');
    console.log(`${problems.length ? '✗' : '✓'} pairs: ${p.cells.length} pares, con P/E ${p.cells.filter((c) => c.zPe != null).length}`);
    problems.forEach((x) => console.log('    ' + x));
    fails += problems.length;
    continue;
  }
  if (id === 'pair') {
    if (!p.win?.y5 || !p.win?.y10 || !p.trend) problems.push('par: faltan ventanas de 5/10 años o la tendencia');
    if (p.candles.length < 200 || !(p.stats.sd > 0) || !Number.isFinite(p.stats.z)) problems.push(`par: ${p.candles.length} velas, desvío ${p.stats.sd}`);
    if (p.candles.some((c) => c.h < Math.max(c.o, c.c) || c.l > Math.min(c.o, c.c))) problems.push('par: velas con máximo/mínimo incoherentes');
    console.log(`${problems.length ? '✗' : '✓'} pair: ${p.tickers.a}/${p.tickers.b}, ${p.candles.length} velas, z ${p.stats.z.toFixed(2)}`);
    problems.forEach((x) => console.log('    ' + x));
    fails += problems.length;
    continue;
  }
  if (id === 'cal') {
    const by = (re) => p.events.find((e) => e.ccy === 'USD' && re.test(e.title));
    const cpi = by(/^CPI m\/m$/), rs = by(/^Retail Sales/), cl = by(/Claims/), ifo = p.events.find((e) => /ifo/.test(e.title)), auct = p.events.filter((e) => e.kind === 'auct');
    if (!cpi?.actual || !/%$/.test(cpi.actual) || !cpi.surprise || !/FRED CPIAUCSL/.test(cpi.actualSrc)) problems.push('calendario: dato real de EE.UU. (FRED) o sorpresa');
    if (rs?.actual) problems.push('calendario: no debe tomar un dato de FRED publicado antes del evento');
    if (cl?.actual || ifo?.actual) problems.push('calendario: evento futuro o sin fuente con dato real');
    const two = auct.find((e) => /^2-Year Note/.test(e.title));
    // Esperado = promedio de las 6 previas (2,52…2,62 → 2,57), sin la 7.ª (9,99); anterior = la del mes previo; dato = resultado de TreasuryDirect.
    if (!two || two.forecast !== 'BTC 2.57' || !/4\.690% · BTC 2\.52/.test(two.previous || '') || !/4\.700% · BTC 2\.65/.test(two.actual || '')) problems.push(`calendario: licitación 2Y (${two?.actual} | ${two?.forecast} | ${two?.previous})`);
    if (p.events.some((e, i) => i && e.time < p.events[i - 1].time)) problems.push('calendario: orden por hora');
    // Dato oficial fuera de EE.UU.: StatCan (índice → m/m: 1,002 → 0,2%) y ONS (nivel 3,6%); el PMI no tiene fuente oficial.
    const ca = p.events.find((e) => e.ccy === 'CAD' && e.title === 'CPI m/m'), gb = p.events.find((e) => e.ccy === 'GBP' && e.title === 'CPI y/y');
    if (ca?.actual !== '0.2%' || !/StatCan v41690973/.test(ca?.actualSrc || '')) problems.push(`calendario: dato de StatCan (${ca?.actual})`);
    if (gb?.actual !== '3.6%' || gb?.surprise?.diff !== -0.1 || !/ONS D7G7/.test(gb?.actualSrc || '')) problems.push(`calendario: dato de ONS (${gb?.actual})`);
    if (p.events.find((e) => e.ccy === 'GBP' && /PMI/.test(e.title))?.actual) problems.push('calendario: PMI sin fuente oficial no debe tener dato');
    const jp = p.events.find((e) => e.ccy === 'JPY' && e.title === 'SPPI y/y');
    if (!/%$/.test(jp?.actual || '') || !/BoJ PRCS20_5200000000%/.test(jp?.actualSrc || '')) problems.push(`calendario: dato de la BoJ (${jp?.actual})`);
    console.log(`${problems.length ? '✗' : '✓'} cal: ${p.events.length} eventos, ${auct.length} licitaciones`);
    problems.forEach((x) => console.log('    ' + x));
    fails += problems.length;
    continue;
  }
  if (id === 'news') {
    const it = p.items, byT = (re) => it.find((i) => re.test(i.title));
    if (it.length !== 13) problems.push(`noticias: ${it.length} titulares (esperados 13: sin duplicado ni el de hace 60 h)`);
    if (it.some((x, i) => i && x.time > it[i - 1].time)) problems.push('noticias: no están ordenadas de la más nueva a la más vieja');
    const ar = byT(/riesgo país/);
    if (ar?.source !== 'Ámbito' || ar?.via !== 'Google Noticias' || ar?.title.includes(' - ') || !ar?.countries.includes('ar')) problems.push('noticias: medio de Google Noticias o país');
    if (!byT(/Lagarde/)?.tags.includes('cb') || !byT(/approval of application/)?.tags.includes('cb')) problems.push('noticias: comunicados de bancos centrales sin etiqueta');
    if (!byT(/Brazil inflation/)?.tags.includes('data') || !byT(/Brazil inflation/)?.countries.includes('br')) problems.push('noticias: etiqueta de dato o país (Brasil)');
    if (!byT(/Milei/)?.tags.includes('pol')) problems.push('noticias: etiqueta de política');
    const fj = p.sources.find((s) => s.key === 'fj');
    if (fj?.ok !== false || p.errors.length) problems.push('noticias: una fuente caída debe quedar "no disponible" sin error del panel');
    console.log(`${problems.length ? '✗' : '✓'} news: ${it.length} titulares, ${p.sources.filter((s) => s.ok).length}/${p.sources.length} fuentes`);
    problems.forEach((x) => console.log('    ' + x));
    fails += problems.length;
    continue;
  }
  if (id === 'rank') {
    const byId = Object.fromEntries(p.countries.map((c) => [c.id, c]));
    if (p.countries.length !== 8) problems.push(`ranking: ${p.countries.length} países (esperados 8)`);
    if (p.countries.some((c) => c.total == null || c.total < 0 || c.total > 100)) problems.push('ranking: total fuera de 0–100');
    if (byId.ar?.raw.yearsNoDefault !== 0 || byId.ec?.raw.yearsNoDefault !== 5 || byId.uy?.raw.yearsNoDefault !== 22 || byId.pe?.raw.yearsNoDefault !== 30 || byId.br?.raw.yearsNoDefault !== 30)
      problems.push('ranking: años sin default mal calculados (umbral o acreedores oficiales)');
    if (byId.cl?.raw.extShare != null) problems.push('ranking: Chile no debería usar la residencia del acreedor');
    if (byId.ec?.raw.fxShare !== 100 || byId.ec?.coverage !== 100) problems.push('ranking: Ecuador debería usar su dato propio (dolarizado = 100% en ME)');
    if (!p.fit || p.countries.some((c) => c.spread != null && c.spreadFit == null)) problems.push('ranking: falta el ajuste contra el spread');
    console.log(`${problems.length ? '✗' : '✓'} rank: ${p.countries.map((c) => `${c.rank}.${c.id}`).join(' ')}`);
    problems.forEach((x) => console.log('    ' + x));
    fails += problems.length;
    continue;
  }
  if (id === 'usd') {
    const withCurve = p.issuers.filter((i) => i.summary.n > 0);
    if (withCurve.length < 3) problems.push(`solo ${withCurve.length} emisores con curva`);
    if (!p.ust.length) problems.push('sin curva del Tesoro');
    if (!p.embi?.countries?.length) problems.push('sin EMBI');
    else if (p.embi.countries.some((c) => c.values.length !== p.embi.dates.length)) problems.push('EMBI: series desalineadas');
    else if (!p.embi.countries.find((c) => c.id === 'cl')?.chg?.m1 === undefined) problems.push('EMBI: sin variaciones');
    if (p.issuers.some((i) => i.bonds.some((b) => !b.stale && b.spread == null && b.years <= 30))) problems.push('bonos sin spread');
    console.log(`${problems.length ? '✗' : '✓'} usd: ${p.issuers.length} emisores, ${p.issuers.reduce((s, i) => s + i.bonds.length, 0)} bonos`);
    problems.forEach((x) => console.log('    ' + x));
    fails += problems.length;
    continue;
  }
  if (id !== 'world') {
    if (!p.equity?.msci?.perf) problems.push('sin bloque MSCI');
    if (!p.calendar.length && !['mx', 'pe'].includes(id)) problems.push('agenda vacía');
    p.charts.forEach((c) => c.data.length || problems.push(`gráfico vacío: ${c.id}`));
    if (id === 'br' && !['IBGE – IPCA', 'IBGE – IPCA-15 (mitad de mes)', 'IBGE – PIB trimestral (Contas Nacionais)'].every((ev) => p.calendar.some((e) => e.event === ev))) problems.push('agenda BR sin IPCA / IPCA-15 / PIB');
  } else if (p.markets.some((m) => !m.perf)) problems.push('mercados sin datos');
  console.log(`${problems.length ? '✗' : '✓'} ${id}: ${(p.kpis || p.markets).length} items${p.path ? `, trayectoria ${p.path.path.length}` : ''}, agenda ${p.calendar?.length ?? '-'}`);
  problems.forEach((x) => console.log('    ' + x));
  fails += problems.length;
}
// IPC Colombia desde la UVR: con IPC mensual constante de 0,5% el a/a debe dar 1,005^12 − 1 = 6,17%.
{
  const { ipcFromUvr } = await import('../api/_lib/sources/co.js');
  const uvr = [];
  let v = 300;
  for (let t = Date.UTC(2023, 0, 16); t < Date.UTC(2026, 0, 16); t += 864e5) {
    const d = new Date(t);
    // Del 16 de t al 15 de t+1 la UVR acumula la variación mensual del IPC (interés compuesto diario).
    const diasPeriodo = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (d.getUTCDate() >= 16 ? 1 : 0), 15) - Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (d.getUTCDate() >= 16 ? 0 : 1), 15)) / 864e5);
    v *= 1.005 ** (1 / diasPeriodo);
    uvr.push({ d: d.toISOString().slice(0, 10), v });
  }
  const ipc = ipcFromUvr(uvr);
  assert.ok(ipc.length >= 20, 'ipcFromUvr: pocos meses');
  for (const p of ipc) assert.ok(Math.abs(p.v - 6.17) < 0.02, `ipcFromUvr ${p.d}: ${p.v}`);
  console.log(`✓ ipcFromUvr: ${ipc.length} meses, ${ipc[0].v}%`);
}
// TIR de bonos bullet: a la par (en fecha de cupón) rinde el cupón; bajo la par rinde más; ISMA→semestral.
{
  const { ytmBullet, ismaToSemi, isAmortizing } = await import('../api/_lib/sources/usd.js');
  assert.ok(Math.abs(ytmBullet(100, 6, '2036-05-15', '2026-05-15') - 6) < 1e-3, 'TIR a la par ≠ cupón');
  assert.ok(Math.abs(ytmBullet(100, 5, '2031-01-15', '2026-03-15') - 5) < 0.02, 'TIR a la par entre cupones');
  assert.ok(ytmBullet(90, 5, '2036-01-15', '2026-03-15') > 6.3, 'TIR bajo la par');
  assert.ok(Math.abs(ismaToSemi(6.09) - 6.0) < 0.01, 'ISMA→semestral');
  assert.ok(isAmortizing('Argentinien DL-Bonds 2020(20/31-35)') && !isAmortizing('Brasilien DL-Bonds 2025(25/56)'), 'detección de amortizables');
  const { modDurBullet } = await import('../api/_lib/sources/usd.js');
  const dur = modDurBullet(6, 6, '2036-05-15', '2026-05-15');
  assert.ok(dur > 7.2 && dur < 7.6, `duration 10 años al 6%: ${dur}`);
  console.log('✓ ytmBullet / ismaToSemi / modDurBullet');
}
// API del BCCh: fechas dd-mm-aaaa, NaN descartado, y error claro con token vencido.
{
  const { parseBdeApi } = await import('../api/_lib/sources/cl.js');
  const s = parseBdeApi({ Codigo: 0, Series: { Obs: [{ indexDateString: '19-11-2026', value: '4.5' }, { indexDateString: '18-11-2026', value: 'NaN' }] } }, 'X');
  assert.deepEqual(s, [{ d: '2026-11-19', v: 4.5 }]);
  assert.throws(() => parseBdeApi({ Codigo: -5, Descripcion: 'Invalid username or password' }, 'X'), /token inválido o vencido/);
  console.log('✓ parseBdeApi');
}
// BIS: el par fecha,valor se toma aunque haya comas en los campos de texto; NaN se descarta.
{
  const { parseBis } = await import('../api/_lib/bis.js');
  const s = parseBis('H\nD,IN,368,0,,Note: a, b; c.,4,RBI,x, y,Title,2026-10-16,5.5,A,F,\nD,IN,368,0,,n,4,RBI,x,T,2026-10-17,NaN,M,F,\nM,PE,771,0,,,,,,2026-09,4.54,F,,A\n');
  assert.deepEqual(s, [{ d: '2026-09-01', v: 4.54 }, { d: '2026-10-16', v: 5.5 }]);
  const { parseDaneMonth } = await import('../api/_lib/sources/co.js');
  const ev = parseDaneMonth('<a href="/index.php/calendario/icalrepeat.detail/2027/01/08/10/-/ipc"><strong> Índice de Precios al Consumidor (IPC)</strong></a><a href="/index.php/calendario/icalrepeat.detail/2027/01/09/11/-/x"><strong> Resultados del IPC sin alimentos ni regulados (IPC)</strong></a>');
  assert.deepEqual(ev.map((e) => e.date + ' ' + e.event), ['2027-01-08 DANE – IPC']);
  console.log('✓ parseBis / parseDaneMonth');
}
// Flujos de ETF: (Δcuotas) × NAV; ventanas y % de activos.
{
  const { computeFlows, parseHistorical } = await import('../api/_lib/sources/val.js');
  const h = parseHistorical('<ss:Worksheet ss:Name="Historical"><ss:Row><ss:Cell><ss:Data>As Of</ss:Data></ss:Cell></ss:Row>'
    + '<ss:Row><ss:Cell><ss:Data>Nov 19, 2026</ss:Data></ss:Cell><ss:Cell><ss:Data>10</ss:Data></ss:Cell><ss:Cell><ss:Data>--</ss:Data></ss:Cell><ss:Cell><ss:Data>1,200</ss:Data></ss:Cell></ss:Row>'
    + '<ss:Row><ss:Cell><ss:Data>Nov 18, 2026</ss:Data></ss:Cell><ss:Cell><ss:Data>9</ss:Data></ss:Cell><ss:Cell><ss:Data>--</ss:Data></ss:Cell><ss:Cell><ss:Data>1000</ss:Data></ss:Cell></ss:Row>'
    + '<ss:Row><ss:Cell><ss:Data>Jul 10, 2000</ss:Data></ss:Cell><ss:Cell><ss:Data>20</ss:Data></ss:Cell><ss:Cell><ss:Data>--</ss:Data></ss:Cell><ss:Cell><ss:Data>--</ss:Data></ss:Cell></ss:Row></ss:Worksheet>');
  assert.deepEqual(h, [{ d: '2026-11-18', nav: 9, so: 1000 }, { d: '2026-11-19', nav: 10, so: 1200 }]);
  const fl = computeFlows([{ d: '2025-11-01', nav: 10, so: 1e6 }, ...h.map((r) => ({ ...r, so: r.so * 1e3 }))]);
  // 1e6 → 1,0e6 (sin cambio) → 1,2e6: el último día entran 200.000 cuotas × 10 = USD 2 M; activos = 1,2e6 × 10 = USD 12 M.
  assert.ok(Math.abs(fl.flows.w1 - 2) < 1e-9 && Math.abs(fl.pct.w1 - 2 / 12 * 100) < 1e-9 && fl.aum === 12, 'computeFlows');
  console.log('✓ parseHistorical / computeFlows');
}
// Control de calidad de worldperatio: meses repetidos y ventana anterior al lanzamiento del ETF.
{
  const { wpeQuality } = await import('../api/_lib/sources/val.js');
  const months = (n, f) => Array.from({ length: n }, (_, i) => ({ d: `${2026 - Math.floor((n - 1 - i) / 12)}-${String(12 - ((n - 1 - i) % 12)).padStart(2, '0')}-01`.replace(/-(\d)-/, '-0$1-'), v: f(i) }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  const clean = wpeQuality({ etf: 'EWZ', date: '2026-11-19', history: months(240, (i) => 10 + Math.sin(i)) });
  assert.ok(clean.y5.ok && clean.y10.ok && clean.y5.stale === 0, 'serie limpia marcada como mala');
  const stale = wpeQuality({ etf: 'EWZ', date: '2026-11-19', history: months(240, (i) => 10 + Math.floor(i / 4)) });
  assert.ok(!stale.y5.ok && stale.y5.stale > 0.5, 'serie con valores repetidos no detectada');
  const young = wpeQuality({ etf: 'XLC', date: '2026-11-19', history: months(240, (i) => 10 + Math.sin(i)) });
  assert.ok(young.y5.ok && !young.y10.ok && young.y10.preLaunch, 'ventana anterior al lanzamiento no detectada');
  console.log('✓ wpeQuality');
}
// Ranking: puntaje min-max contra el grupo y ajuste del spread.
{
  const { scoreIndicator, fitSpreads } = await import('../api/_lib/sources/rank.js');
  assert.deepEqual(scoreIndicator({ a: 10, b: 20, c: 30 }, 'low'), { a: 100, b: 50, c: 0 });
  assert.deepEqual(scoreIndicator({ a: 10, b: 20 }, 'high'), {}, 'con menos de 3 países no se puntúa');
  const f = fitSpreads([0, 25, 50, 75, 100].map((x, i) => ({ id: String(i), score: x, spread: 1000 * Math.exp(-0.03 * x) })));
  assert.ok(Math.abs(f.b + 0.03) < 1e-9 && Math.abs(f.r2 - 1) < 1e-9, 'fitSpreads');
  console.log('✓ scoreIndicator / fitSpreads');
}
// Curva del Tesoro: reintento de las series de FRED que fallan y respaldo con Yahoo.
{
  const { ustCurve } = await import('../api/_lib/sources/usd.js');
  let calls = 0;
  const flaky = async (id) => { calls++; if (calls <= 6) throw new Error('429'); return [{ d: '2026-11-19', v: 4 }]; };
  const a = await ustCurve({ fredFn: flaky, yahooFn: async () => [], wait: 1 });
  assert.equal(a.length, 11, 'reintento de FRED');
  const down = async () => { throw new Error('caído'); };
  const b = await ustCurve({ fredFn: down, yahooFn: async (t) => [{ d: '2026-11-19', v: t === '^TNX' ? 4.4 : 4 }], wait: 1 });
  assert.deepEqual(b.map((p) => p.x), [0.25, 5, 10, 30], 'respaldo con Yahoo');
  assert.ok(b.every((p) => p.src === 'Yahoo'));
  await assert.rejects(ustCurve({ fredFn: down, yahooFn: async () => [], wait: 1 }), /incompleta/);
  console.log('✓ ustCurve (reintento y respaldo)');
}
// Noticias: clasificación por palabras clave y prefijo de FinancialJuice.
{
  const { classify, mergeNews, parseRss } = await import('../api/_lib/sources/news.js');
  const c = classify('Powell says the Fed will cut rates; let us see');
  assert.ok(c.tags.includes('cb') && c.countries.includes('us'));
  assert.ok(!classify('Tell us more about the plan').countries.includes('us'), '"us" pronombre no es EE.UU.');
  assert.deepEqual(classify('Petrobras sube y el real se aprecia').countries, ['br']);
  const now = Date.parse('2026-11-20T12:00:00Z');
  const items = parseRss('<rss><channel><item><title>FinancialJuice: US CPI &amp; core beat</title><pubDate>Fri, 20 Nov 2026 11:58:00 GMT</pubDate></item></channel></rss>');
  const m = mergeNews([{ feed: { key: 'fj', label: 'FinancialJuice', strip: /^FinancialJuice:\s*/i }, items }], now);
  assert.equal(m[0].title, 'US CPI & core beat');
  assert.ok(m[0].tags.includes('data'));
  // Misma noticia en dos medios → un titular con "+1 fuente"; generalista sin tema de mercado → afuera; "medio" que no es noticia → afuera.
  const { parseBsky, similarity } = await import('../api/_lib/sources/news.js');
  const T = (min) => new Date(now - min * 60e3).toISOString();
  const merged = mergeNews([
    { feed: { key: 'a', label: 'Bloomberg' }, items: [{ title: 'Brazil real slides as Haddad exit rumors hit local markets', time: T(30) }] },
    { feed: { key: 'b', label: 'Google Noticias', viaPublisher: true, finance: true }, items: [
      { title: 'Brazil real slides as rumors of Haddad exit hit markets - Reuters', time: T(20) },
      { title: 'Recipe of the day: apple pie - Cooking', time: T(10) },
      { title: 'European stocks fall as banks drop - Facebook', time: T(5) },
    ] },
  ], now);
  assert.equal(merged.length, 1, 'duplicado, receta y Facebook afuera');
  assert.ok(merged[0].source === 'Bloomberg' && merged[0].also?.[0]?.source === 'Reuters' && merged[0].countries.includes('br'), 'queda el primero, con el otro medio en "también en"');
  assert.ok(similarity('Fed holds rates steady', 'Apple launches new iPhone') < 0.2);
  assert.ok(!classify('Dax Shepard reveals new podcast').countries.includes('eu') && classify('DAX falls 2% as German exports slump').tags.includes('mkts'), 'DAX solo en mayúsculas');
  const bs = parseBsky({ feed: [{ post: { uri: 'at://did:x/app.bsky.feed.post/abc', record: { text: 'Oil jumps 3% after OPEC+ cut', createdAt: T(3) }, embed: { external: { uri: 'https://reut.rs/x', title: 'Oil jumps' } } } }, { reason: { $type: 'repost' }, post: { record: { text: 'repost', createdAt: T(1) } } }] }, 'reuters.com');
  assert.ok(bs.length === 1 && bs[0].link === 'https://reut.rs/x' && bs[0].title.startsWith('Oil jumps 3%'), 'Bluesky: post propio con el link de la nota, sin reposts');
  console.log('✓ classify / mergeNews');
}
// Colombia: TES 10Y diario de Suameca (fechas de Bogotá, sin corrimiento de día).
{
  const co = out.co.kpis.find((k) => k.key === 'y10');
  assert.ok(/cero cupón/.test(co.label) && /Suameca/.test(co.source), 'Colombia debería usar el TES diario de Suameca');
  assert.ok((Date.parse(co.date) - Date.parse(co.prevDate)) / 864e5 <= 3, 'TES 10Y: dato diario');
  assert.ok(![0, 6].includes(new Date(co.date + 'T12:00:00Z').getUTCDay()), 'TES 10Y: la fecha no debe caer en fin de semana');
  console.log('✓ Colombia TES 10Y diario (Suameca)');
}
// Colombia: todo desde Suameca (política, IPC, IBR, TES UVR) y expectativas de la EME (planilla histórica con hojas por nombre).
{
  const p = out.co, K = Object.fromEntries(p.kpis.map((k) => [k.key, k]));
  for (const k of ['policy', 'ibr_on', 'cpi', 'exp_cpi', 'exp_rate', 'exp_fx', 'be10', 'ibr3', 'y2', 'y10', 'r10', 'fx']) assert.ok(K[k]?.value != null, `Colombia: falta ${k}`);
  assert.equal(K.policy.value, 12.25);
  assert.ok(K.policy.date <= new Date().toISOString().slice(0, 10), 'Colombia: la tasa de política no debe tener fechas futuras');
  assert.ok(K.ibr3.value > 11.67 && K.ibr3.value < 12.3, `IBR 3M efectiva: ${K.ibr3.value}`);
  assert.ok(Math.abs(K.be10.value - ((1 + K.y10.value / 100) / (1 + K.r10.value / 100) - 1) * 100) < 0.01, 'implícita 10Y = (1+pesos)/(1+UVR)−1');
  assert.equal(K.exp_fx.value, 3415.5);
  assert.ok(p.path?.kind === 'survey' && p.path.path.length === 25 && p.path.path[0].rate === 12.25 && /^\d{4}-\d{2}$/.test(p.path.path[0].label), 'EME: trayectoria t…t+24');
  const e = p.expectations[0];
  assert.ok(e && e.rows.length === 3 && e.rows[0][1] === 0.29 && e.rows[2][3] === 3415.5, 'EME: tabla de medianas');
  const m = Number(e.asOf.slice(5, 7));
  assert.equal(e.rows[1][2], +((0.1225 - (12 - m) * 0.0013) * 100).toFixed(2), 'EME: tasa a diciembre = t+(12−m)');
  assert.equal(p.errors.length, 0, `Colombia sin errores: ${JSON.stringify(p.errors)}`);
  const { readSheetsByName } = await import('../api/_lib/xlsx.js');
  const emeBuf = Buffer.from(await (await mockFetch('https://suameca.banrep.gov.co/archivos/encuestas/x/series_historicas.xlsx')).arrayBuffer());
  assert.throws(() => readSheetsByName(emeBuf, ['NO EXISTE']), /faltan las hojas NO EXISTE/);
  console.log('✓ Colombia: Suameca + EME');
}
// Fed: método FedWatch con una tira sintética (+25 pb en la 1.ª reunión, ~50% de +25 en la 2.ª) y el payload de EE.UU.
{
  const { fedWatch } = await import('../api/_lib/fedprobs.js');
  const strip = [{ month: '2027-01', implied: 4.0 }, { month: '2027-02', implied: 4.0 }, { month: '2027-03', implied: 4.0 + 0.125 * (14 / 31) }, { month: '2027-04', implied: 4.125 }];
  const fw = fedWatch({ strip, meetings: ['2027-01-31', '2027-03-17'], effr: 3.75, lower: 3.5, upper: 3.75, asOf: '2026-12-15' });
  // Enero: reunión el último día → posterior = febrero (4,00), previa = EFFR (3,75): +25 pb seguro.
  assert.ok(Math.abs(fw.meetings[0].hike - 1) < 1e-9 && fw.meetings[0].moves.length === 1, 'FedWatch: suba segura en la 1.ª reunión');
  const m2 = fw.meetings[1];
  assert.ok(Math.abs(m2.hike - 0.5) < 1e-6 && Math.abs(m2.hold - 0.5) < 1e-6, `FedWatch: 50/50 en la 2.ª reunión (${m2.hike})`);
  assert.ok(Math.abs(m2.cumHike - 1) < 1e-9 && m2.ranges.length === 2, 'FedWatch: distribución acumulada');
  const us = out.us;
  assert.ok(us.fedProbs?.futures?.meetings?.length > 0, 'EE.UU.: faltan las probabilidades de futuros');
  const pmk = us.fedProbs.polymarket;
  assert.ok(pmk.length === 1 && Math.abs(pmk[0].hold - 0.75) < 1e-9 && Math.abs(pmk[0].cut - 0.2) < 1e-9, 'Polymarket: lectura y normalización');
  assert.equal(pmk[0].date, us.fedProbs.futures.meetings[0].date, 'Polymarket: asignación a la reunión del FOMC');
  console.log('✓ Fed: FedWatch y Polymarket');
}
// Licitaciones del Tesoro: cronograma tentativo + anunciadas + resultados; sin letras.
{
  const auct = out.us.calendar.filter((e) => e.kind === 'auct');
  const by = (re) => auct.find((e) => re.test(e.event));
  assert.ok(!auct.some((e) => /semanas/.test(e.event)), 'Tesoro: las letras no van a la agenda');
  assert.ok(/USD 70\.000 M · cierre 13:00 ET/.test(by(/5 años \(Nota\)/)?.event || ''), 'Tesoro: monto y hora de la licitación anunciada');
  assert.ok(/FRN, reapertura\) · USD 28\.000 M · cierre 11:30 ET/.test(by(/FRN/)?.event || ''), 'Tesoro: FRN emparejada por plazo original');
  assert.ok(/tentativa/.test(by(/TIPS/)?.event || ''), 'Tesoro: licitación tentativa');
  const { auctionEvents } = await import('../api/_lib/treasury.js');
  const past = auctionEvents([{ term: '2-Year', type: 'NOTE', date: '2026-11-23' }], [], [{ securityType: 'Note', securityTerm: '2-Year', type: 'Note', floatingRate: 'No', auctionDate: '2026-11-23T00:00:00', offeringAmount: '69000000000', highYield: '4.700', bidToCoverRatio: '2.65' }]);
  assert.ok(/corte 4,700% · bid-to-cover 2,65/.test(past[0].event), 'Tesoro: resultado de la licitación');
  console.log('✓ Tesoro: licitaciones');
}
// Calendario: formato de números, transformaciones y hora de Nueva York.
{
  const { parseNum, transform, etIso, withSurprise } = await import('../api/_lib/sources/cal.js');
  assert.deepEqual(parseNum('-135.9B'), { v: -135.9, unit: 'B', dec: 1 });
  assert.deepEqual(parseNum('201K'), { v: 201, unit: 'K', dec: 0 });
  assert.equal(parseNum(''), null);
  const desc = [{ value: '110' }, { value: '100' }, ...Array(10).fill({ value: '99' }), { value: '88' }];
  assert.equal(transform(desc, 'diff'), 10);
  assert.ok(Math.abs(transform(desc, 'mom') - 10) < 1e-9 && Math.abs(transform(desc, 'yoy') - 25) < 1e-9);
  assert.equal(etIso('2026-11-24', '13:00'), '2026-11-24T18:00:00.000Z'); // EST
  assert.equal(etIso('2026-07-15', '13:00'), '2026-07-15T17:00:00.000Z'); // EDT
  const e = withSurprise({ forecast: '201K', previous: '203K' }, 215.4);
  assert.equal(e.actual, '215K'); assert.deepEqual(e.surprise, { diff: 14, unit: 'K', dir: 'up' });
  console.log('✓ calendario: formato, transformaciones y hora ET');
}
// América Latina: IPCA con consenso Focus (mes anterior a la publicación) e IPCA-15 sin consenso.
{
  const { brazilInflation } = await import('../api/_lib/latamCal.js');
  const ev = await brazilInflation(new Date().toISOString().slice(0, 10), new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10));
  const ipca = ev.find((e) => /^IPCA m\/m/.test(e.title)), i15 = ev.find((e) => /^IPCA-15/.test(e.title));
  assert.ok(ipca && ipca.forecast === '0.38%' && /Focus/.test(ipca.forecastNote) && ipca.actual == null, 'Brasil: IPCA con Focus');
  assert.ok(i15 && i15.forecast == null && /no releva/.test(i15.forecastNote), 'Brasil: IPCA-15 sin consenso');
  console.log('✓ calendario: Brasil (IBGE + Focus + SGS)');
}
// México y Colombia: dos filas (m/m y a/a) por publicación; EE.UU. semana siguiente desde el calendario de FRED; decisiones de bancos centrales.
{
  const { mexicoInflation, colombiaInflation } = await import('../api/_lib/latamCal.js');
  const mx = await mexicoInflation('2026-12-01', '2026-12-31');
  assert.ok(mx.length === 2 && mx[0].title === 'INPC m/m (noviembre)' && mx[0].previous && mx[1].title === 'INPC a/a (noviembre)' && mx[0].time === '2026-12-09T12:00:00.000Z', 'México: INPC (06:00 CDMX)');
  const co = await colombiaInflation('2026-12-01', '2026-12-10');
  assert.ok(co.length === 2 && /UVR/.test(co[0].forecastNote + co[0].actualSrc + 'UVR') && co[0].time === '2026-12-07T23:00:00.000Z', 'Colombia: IPC (18:00 Bogotá)');
  const { usNextWeek, cbEvents } = await import('../api/_lib/sources/cal.js');
  const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const nx = await usNextWeek(d(0), d(25), new Map());
  const cpi = nx.find((e) => e.title === 'CPI m/m');
  assert.ok(cpi && /%$/.test(cpi.previous || '') && cpi.forecast == null && /Forex Factory/.test(cpi.forecastNote), 'EE.UU. semana siguiente: CPI con anterior de FRED');
  assert.ok(!nx.some((e) => /Durable/.test(e.title)), 'EE.UU.: sin durables (release mixto)');
  const cb = cbEvents('2026-12-01', '2026-12-31', '2026-12-05');
  assert.ok(cb.some((e) => e.ccy === 'USD' && e.time.startsWith('2026-12-09')) && cb.every((e) => e.kind === 'cb'), 'Bancos centrales: FOMC del 9-dic (fuera de la semana de Forex Factory)');
  console.log('✓ calendario: México, Colombia, EE.UU. semana siguiente y bancos centrales');
}
// Acceso: middleware con usuarios por variable de entorno (contraseña directa o hash PBKDF2) y cookie firmada.
{
  const auth = await import('../api/_lib/auth.js');
  const { default: middleware } = await import('../middleware.js');
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith('AUTH_')) delete process.env[k];
  const req = (path, init = {}) => new Request(`https://panel.test${path}`, init);
  let r = await middleware(req('/'));
  assert.equal(r.status, 503, 'sin usuarios configurados el panel queda cerrado');
  process.env.AUTH_PASS_HDSP = 'clave-de-prueba';
  process.env.AUTH_PASS_JV = await auth.hashPassword('otra clave', 1000);
  r = await middleware(req('/?mock=0#val'));
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://panel.test/login?next=%2F%3Fmock%3D0');
  assert.equal((await middleware(req('/api/country?c=us'))).status, 401, 'la API también exige sesión');
  assert.equal((await middleware(req('/login'))).status, 200);
  const post = (user, password, next = '/') => middleware(req('/login', { method: 'POST', body: new URLSearchParams({ user, password, next }) }));
  assert.equal((await post('HDSP', 'mal')).status, 401, 'contraseña incorrecta');
  assert.equal((await post('NADIE', 'clave-de-prueba')).status, 401, 'usuario inexistente');
  r = await post('hdsp', 'clave-de-prueba', '//evil.com');
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/', 'no redirige afuera del sitio');
  const set = r.headers.getSetCookie();
  const session = set.find((c) => c.startsWith('pm_s='));
  assert.ok(/HttpOnly/.test(session) && /Secure/.test(session) && set.some((c) => c.startsWith('pm_u=HDSP')), 'cookies de sesión');
  const value = session.split(';')[0].slice(5);
  assert.equal(await middleware(req('/api/country?c=us', { headers: { cookie: `pm_s=${value}` } })), undefined, 'con sesión pasa');
  assert.equal(await auth.readSession(value.replace('HDSP', 'JV')), null, 'cookie adulterada');
  assert.equal(await auth.readSession(value, process.env, Date.now() + 31 * 864e5), null, 'sesión vencida');
  assert.equal(await auth.checkLogin('jv', 'otra clave'), 'JV', 'hash PBKDF2');
  const basic = (u, p) => ({ headers: { authorization: `Basic ${btoa(`${u}:${p}`)}` } });
  assert.equal(await middleware(req('/api/country?c=us', basic('HDSP', 'clave-de-prueba'))), undefined, 'Authorization: Basic correcto');
  assert.equal((await middleware(req('/api/country?c=us', basic('HDSP', 'mal')))).status, 401, 'Authorization: Basic incorrecto');
  process.env.AUTH_PASS_HDSP = 'nueva';
  assert.equal(await auth.readSession(value), null, 'al cambiar una contraseña se cierran las sesiones');
  for (const k of Object.keys(process.env)) if (k.startsWith('AUTH_')) delete process.env[k];
  Object.assign(process.env, Object.fromEntries(Object.entries(saved).filter(([k]) => k.startsWith('AUTH_'))));
  console.log('✓ acceso: login, sesión firmada, API protegida y cierre de sesiones');
}
// Mundo: en monedas, la variación del día es contra el cierre anterior de Yahoo (range=1d), no contra la barra diaria anterior.
{
  const fx = out.world.markets.find((m) => m.ticker.endsWith('=X'));
  assert.ok(fx?.perf?.prevClose && Math.abs(fx.perf.d1 - (fx.perf.last / fx.perf.prevClose - 1) * 100) < 1e-9, 'Mundo: variación de monedas contra el cierre anterior');
  const ars = out.world.markets.find((m) => m.ticker === 'ARS=X');
  assert.ok(ars.perf.last === 1605.5 && ars.perf.d1 === 0.31 && ars.quoteLabel === 'UST$T (A3)' && ars.spark.length > 10, 'USDARS: UST$T de A3 con historia del A3500');
  const { a3Dollar, parseSnapshot } = await import('../api/_lib/a3.js');
  const pre = a3Dollar({ totals: [{ id: 'UST$T000', value: 0, variation: 0 }, { id: 'BCRACOM3500', value: 1600, variation: -0.5, date: '2026-11-26T00:00:00' }] });
  assert.ok(pre.label === 'A3500 (BCRA)' && pre.last === 1600, 'sin operaciones de UST$T: A3500 rotulado');
  assert.equal(parseSnapshot('event: status\ndata: {}\n\nevent: snapshot\ndata: {"stream":"Dashboard","data":{"totals":[]}}\n\n').totals.length, 0);
  console.log('✓ Mundo: monedas contra el cierre anterior de Yahoo; USDARS de A3');
}
// Comparar: cociente, velas semanales y señales.
{
  const { ratioSeries, weeklyCandles, ratioStats } = await import('../api/_lib/sources/pair.js');
  const a = [{ d: '2026-11-16', v: 10 }, { d: '2026-11-17', v: 12 }, { d: '2026-11-18', v: 9 }, { d: '2026-11-20', v: 11 }, { d: '2026-11-23', v: 10 }];
  const b = [{ d: '2026-11-16', v: 5 }, { d: '2026-11-17', v: 4 }, { d: '2026-11-18', v: 3 }, { d: '2026-11-19', v: 5 }, { d: '2026-11-20', v: 5 }, { d: '2026-11-23', v: 5 }];
  const r = ratioSeries(a, b);
  assert.deepEqual(r.map((x) => x.v), [2, 3, 3, 2.2, 2], 'cociente solo con fechas comunes');
  const w = weeklyCandles(r);
  assert.equal(w.length, 2); assert.deepEqual([w[0].o, w[0].h, w[0].l, w[0].c], [2, 3, 2, 2.2], 'vela semanal con cierres diarios');
  const st = ratioStats(Array.from({ length: 60 }, (_, i) => ({ c: i < 59 ? 1 + (i % 2) * 0.2 : 0.7 })));
  assert.ok(st.z < -2 && st.pctile < 5, 'último cierre muy por debajo de la media');
  const { pairSignals } = await import('../src/signals.js');
  {
    const K = (fx, cpi, y2) => ({ kpis: [{ key: 'fx', trend: { m3: fx } }, { key: 'cpi', trend: { m3: cpi } }, { key: 'y2', trend: { m3: y2 } }] });
    const A = { id: 'br', name: 'Brasil', ...K(-4, -80, -60) }, B = { id: 'mx', name: 'México', ...K(3, 40, 30) };
    const sig = pairSignals(A, B, { stats: { z: -1.8, pctile: 2, chg13: 6, aboveMa26: true } });
    assert.equal(sig.verdict.kind, 'strong', `señal contundente (${sig.total})`); assert.equal(sig.verdict.fav.id, 'br');
    const neu = pairSignals(A, B, { stats: { z: 1.5, pctile: 95, chg13: -8, aboveMa26: false } });
    assert.ok(neu.verdict.kind !== 'strong', 'con valuación y momentum en contra no es contundente');
  }
  console.log('✓ Comparar: cociente, velas y señales');
}
// Valuación relativa: z por ventana, calidad del P/E, P/E relativo, tendencia y "caída por ganancias".
{
  const { zStats, windowQuality, relativePe, trendOf } = await import('../api/_lib/relval.js');
  const mon = (n, f) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2016, 11 + i, 1)); return { d: d.toISOString().slice(0, 10), v: f(i) }; });
  const st = zStats(mon(121, (i) => (i < 120 ? 1 + (i % 2) * 0.2 : 0.8)), 10);
  assert.ok(st && st.z < -1.5 && st.years === 10, 'z de 10 años');
  assert.equal(zStats(mon(40, () => 1), 10), null, 'sin historia suficiente no hay z');
  const W = (etf, f) => ({ etf, pe: f(240), date: '2026-11-25', history: mon(241, f) });
  assert.ok(windowQuality(W('EWZ', (i) => 10 + Math.sin(i)), 10).ok, 'serie sin repeticiones pasa');
  assert.ok(!windowQuality(W('EWZ', (i) => 10 + Math.floor(i / 3)), 10).ok, 'serie con meses repetidos no pasa');
  assert.ok(!windowQuality(W('INDA', (i) => 10 + Math.sin(i)), 20).ok, 'ventana anterior al lanzamiento no pasa');
  const pe = relativePe(W('EWZ', (i) => 8 + Math.sin(i / 5)), W('EWW', (i) => 14 + Math.cos(i / 7)));
  assert.ok(pe.win.y10?.ok && pe.win.y3?.ok && Math.abs(pe.last - pe.peA / pe.peB) < 1e-12, 'P/E relativo con el P/E diario al final');
  const up = trendOf(Array.from({ length: 520 }, (_, i) => ({ d: new Date(Date.UTC(2016, 10, 28) + i * 7 * 864e5).toISOString().slice(0, 10), v: Math.exp(0.1 * i / 52) })), 10);
  assert.ok(up.trending && Math.abs(up.perYear - 10.5) < 0.2, `tendencia de 10% anual (${up.perYear})`);
  const { pairSignals } = await import('../src/signals.js');
  const K = () => ({ kpis: [] });
  const sig = pairSignals({ id: 'br', name: 'Brasil', ...K() }, { id: 'mx', name: 'México', ...K() },
    { win: { y5: { z: -1.9 } }, stats: { z: -1.9, chg13: -10, aboveMa26: false }, pe: { last: 0.84, win: { y10: { ok: true, z: 0.5, mean: 0.75, pctile: 70, years: 10 } } } });
  assert.equal(sig.earningsDriven, 'a', 'precio barato pero P/E no: caída por ganancias');
  assert.ok(sig.factors.find((x) => x.key === 'val').score < 0, 'la valuación relativa usa el P/E');
  console.log('✓ valuación relativa: z, calidad, P/E relativo, tendencia y caída por ganancias');
}
fs.writeFileSync(new URL('../src/mock-data.json', import.meta.url), JSON.stringify(out));
if (fails) process.exit(1);
console.log('OK – src/mock-data.json actualizado');
