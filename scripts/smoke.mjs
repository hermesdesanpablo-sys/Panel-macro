// Prueba real contra las APIs: corre cada adaptador y reporta qué KPI llegaron y qué falló.
// Uso: node --env-file=.env scripts/smoke.mjs [br us eu mx ca world]
import { ADAPTERS } from '../api/country.js';

const pick = process.argv.slice(2);
const ids = pick.length ? pick : Object.keys(ADAPTERS);

for (const id of ids) {
  const t0 = Date.now();
  const p = await ADAPTERS[id]();
  console.log(`\n=== ${p.flag} ${p.name}  (${Date.now() - t0} ms)`);
  for (const k of p.kpis || []) {
    const v = k.value == null ? 'n/d' : k.value.toFixed(k.decimals ?? 2);
    console.log(`  ${k.value == null ? '✗' : '✓'} ${k.label.padEnd(28)} ${v.padStart(12)}  ${k.date ?? ''}  ${k.source ?? ''}`);
  }
  for (const m of p.markets || []) console.log(`  ${m.perf ? '✓' : '✗'} ${m.label.padEnd(28)} ${m.perf?.last?.toFixed(2) ?? 'n/d'}`);
  if (p.equity) console.log(`  índice MSCI: ${p.equity.msci?.perf?.last ?? 'n/d'} | local: ${p.equity.local?.perf?.last ?? 'n/d'}`);
  if (p.path) console.log(`  trayectoria: ${p.path.path.length} puntos (${p.path.source})`);
  for (const e of p.expectations || []) console.log(`  expectativas: ${e.title} (${e.rows.length} filas)`);
  console.log(`  agenda: ${(p.calendar || []).length} eventos`);
  for (const e of p.errors) console.log(`  ⚠ ${e.source}: ${e.message}`);
}
