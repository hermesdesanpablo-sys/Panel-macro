// Descubre los bonos soberanos en USD de cada emisor en onvista y guarda la lista en api/_lib/usd-bonds.json.
// Correr cada 2-3 meses (o cuando un país emita): node scripts/discover-usd-bonds.mjs
// La búsqueda de onvista devuelve como máximo 10 resultados: se refina el prefijo del ISIN de a un carácter
// hasta que cada consulta devuelva menos de 10.
import fs from 'node:fs';
import { ISSUERS, ovSnapshot, parseBond } from '../api/_lib/sources/usd.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (macro-dashboard)' };
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q) {
  const r = await fetch(`https://api.onvista.de/api/v1/instruments/query?searchValue=${encodeURIComponent(q)}&limit=100`, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status} buscando ${q}`);
  const j = await r.json();
  await sleep(150);
  return (j.list || []).filter((x) => x.entityType === 'BOND');
}

async function byPrefix(prefix, out, depth = 0) {
  const hits = await search(prefix);
  hits.forEach((h) => out.set(h.isin, h));
  if (hits.length >= 10 && depth < 4) for (const c of CHARS) await byPrefix(prefix + c, out, depth + 1);
}

const today = new Date().toISOString().slice(0, 10);
const result = {};
for (const iss of ISSUERS) {
  const found = new Map();
  for (const p of iss.prefixes) await byPrefix(p, found);
  for (const q of iss.names) (await search(q)).forEach((h) => found.set(h.isin, h));
  const bonds = [];
  for (const isin of found.keys()) {
    try {
      const b = parseBond(await ovSnapshot(isin));
      await sleep(150);
      // Solo deuda soberana del país, en USD, vigente y de tasa fija/step-up (no FRN ni indexados).
      if (b.country !== iss.iso || b.currency !== 'USD' || !b.maturity || b.maturity <= today || b.perpetual) continue;
      if (b.issuerType && b.issuerType !== 'öffentlich') continue;
      // Globales en moneda local pagaderos en USD (p.ej. "RB/DL" Brasil, "KP/DL" Colombia): su tasa es de moneda local.
      if (/\b[A-Z]{2}\/DL-/.test(b.name || '')) continue;
      bonds.push({ isin, name: b.name, coupon: b.coupon, maturity: b.maturity });
    } catch (e) {
      console.warn(`  ${isin}: ${e.message}`);
    }
  }
  // 144A y Reg S del mismo bono: quedarse con uno por (vencimiento, cupón).
  const uniq = new Map();
  for (const b of bonds.sort((x, y) => (x.isin.startsWith('US') ? -1 : 1))) {
    const k = `${b.maturity}|${b.coupon}`;
    if (!uniq.has(k)) uniq.set(k, b);
  }
  result[iss.id] = [...uniq.values()].sort((a, b) => (a.maturity < b.maturity ? -1 : 1));
  console.log(`${iss.id}: ${found.size} candidatos → ${result[iss.id].length} bonos USD vigentes`);
}
const file = new URL('../api/_lib/usd-bonds.json', import.meta.url);
fs.writeFileSync(file, JSON.stringify({ updated: today, source: 'onvista (búsqueda por prefijo de ISIN y nombre)', issuers: result }, null, 1) + '\n');
console.log('OK – api/_lib/usd-bonds.json actualizado');
