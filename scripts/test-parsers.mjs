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
    if (!p.calendar.length && !['mx'].includes(id)) problems.push('agenda vacía');
    p.charts.forEach((c) => c.data.length || problems.push(`gráfico vacío: ${c.id}`));
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
fs.writeFileSync(new URL('../src/mock-data.json', import.meta.url), JSON.stringify(out));
if (fails) process.exit(1);
console.log('OK – src/mock-data.json actualizado');
