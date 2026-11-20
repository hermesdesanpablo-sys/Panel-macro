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
  const p = await fn();
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
fs.writeFileSync(new URL('../src/mock-data.json', import.meta.url), JSON.stringify(out));
if (fails) process.exit(1);
console.log('OK – src/mock-data.json actualizado');
