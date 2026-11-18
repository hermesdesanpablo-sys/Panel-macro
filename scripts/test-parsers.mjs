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
  if (id !== 'world') {
    if (!p.equity?.msci?.perf) problems.push('sin bloque MSCI');
    if (!p.calendar.length && !['mx', 'co'].includes(id)) problems.push('agenda vacía');
    p.charts.forEach((c) => c.data.length || problems.push(`gráfico vacío: ${c.id}`));
  } else if (p.markets.some((m) => !m.perf)) problems.push('mercados sin datos');
  console.log(`${problems.length ? '✗' : '✓'} ${id}: ${(p.kpis || p.markets).length} items${p.path ? `, trayectoria ${p.path.path.length}` : ''}, agenda ${p.calendar?.length ?? '-'}`);
  problems.forEach((x) => console.log('    ' + x));
  fails += problems.length;
}
fs.writeFileSync(new URL('../src/mock-data.json', import.meta.url), JSON.stringify(out));
if (fails) process.exit(1);
console.log('OK – src/mock-data.json actualizado');
