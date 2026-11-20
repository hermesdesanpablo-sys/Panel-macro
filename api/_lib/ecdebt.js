// Ecuador: composición de la deuda pública con dato propio (no reporta a la base QPSD del Banco Mundial).
// Fuente: Boletín de Deuda Pública mensual del Ministerio de Economía y Finanzas (hoy Ministerio de Desarrollo Económico y Productivo),
// página "Deuda Pública – Nueva Metodología". Se usan dos planillas del último mes publicado (~2 meses de atraso):
//  - "Base de Datos Boletín de Deuda <Mes> <Año>", hoja "1." (Indicador Deuda/PIB, consolidado): deuda externa, interna, total y PIB nominal.
//  - "Perfil Vencimientos CP Externa Interna <Mes> <Año>", hoja "16." (Deuda Total Principal): amortizaciones de capital mes a mes.
// Ecuador está dolarizado: toda la deuda es en dólares, una moneda que el país no emite (se informa como 100% en moneda extranjera).
// "Externa" en la metodología ecuatoriana = contraída con acreedores no residentes (organismos, bonos globales, gobiernos).
import { getText } from './util.js';
import { readSheet } from './xlsx.js';

export const EC_DEBT_PAGE = 'https://www.finanzas.gob.ec/deuda-publica-nueva-metodologia/';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Links de descarga de la página: [{ id, url, kind: 'bd'|'cp', ym: 'AAAA-MM' }]. */
export function parseEcDebtLinks(html) {
  const out = [];
  for (const m of html.matchAll(/<a[^>]*href="([^"]*download\.php\?id=(\d+))"[^>]*>([\s\S]*?)<\/a>/g)) {
    const label = norm(m[3].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '));
    const kind = /^base de datos boletin de deuda/.test(label) ? 'bd' : /^perfil vencimientos? cp/.test(label) ? 'cp' : null;
    const mm = label.match(new RegExp(`(${MESES.join('|')}) (\\d{4})`));
    if (kind && mm) out.push({ id: m[2], url: m[1].replace(/&amp;/g, '&'), kind, ym: `${mm[2]}-${String(MESES.indexOf(mm[1]) + 1).padStart(2, '0')}` });
  }
  return out;
}

/** Hoja "1." de la base: { ext, int, total, gdp } en USD (la planilla viene en miles de USD). */
export function parseEcIndicator(rows) {
  const find = (re) => {
    const r = rows.find((x) => x.some((v) => re.test(norm(v))));
    const v = r ? r.map(Number).filter((x) => Number.isFinite(x) && x !== 0).at(-1) : null;
    return v == null ? null : v * 1000;
  };
  const out = { ext: find(/^total deuda externa$/), int: find(/^total deuda interna$/), total: find(/^deuda publica total$/), gdp: find(/^pib nominal$/) };
  if (Object.values(out).some((v) => v == null)) throw new Error('Ecuador: no se encontraron deuda externa/interna/total/PIB en la base (¿cambió la planilla?)');
  return out;
}

/** Hoja "16." del perfil de corto plazo: suma del capital de los próximos 12 meses (fila "CAPITAL DEUDA EXTERNA + INTERNA"). */
export function parseEcMaturities(rows) {
  const ri = rows.findIndex((x) => norm(x[0]) === 'capital deuda externa + interna');
  const hi = rows.findIndex((x, i) => i > ri && x.slice(1).some((v) => new RegExp(`^(${MESES.join('|')}) \\d{4}$`).test(norm(v))));
  if (ri < 0 || hi < 0) throw new Error('Ecuador: perfil de vencimientos sin la fila de capital total o sin meses (¿cambió la planilla?)');
  const months = rows[hi].map((v, j) => ({ j, m: norm(v).match(new RegExp(`^(${MESES.join('|')}) (\\d{4})$`)) })).filter((x) => x.m).slice(0, 12);
  if (months.length < 12) throw new Error('Ecuador: el perfil de vencimientos tiene menos de 12 meses');
  const sum = months.reduce((s, x) => s + (Number(rows[ri][x.j]) || 0), 0);
  const ym = (x) => `${x.m[2]}-${String(MESES.indexOf(x.m[1]) + 1).padStart(2, '0')}`;
  return { due12m: sum, from: ym(months[0]), to: ym(months[11]) };
}

async function xlsx(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${new URL(r.url || url).host}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Composición de la deuda de Ecuador en el mismo formato que debtComposition (QPSD). */
export async function ecuadorDebt() {
  const links = parseEcDebtLinks(await getText(EC_DEBT_PAGE, { timeout: 25000 }));
  const latest = (kind) => links.filter((l) => l.kind === kind).sort((a, b) => (a.ym < b.ym ? 1 : -1))[0];
  const bd = latest('bd'), cp = latest('cp');
  if (!bd) throw new Error('Ecuador: no se encontró la base del boletín de deuda en la página');
  const I = parseEcIndicator(readSheet(await xlsx(bd.url), 2));
  const M = cp && cp.ym === bd.ym ? parseEcMaturities(readSheet(await xlsx(cp.url), 17)) : null;
  const pct = (x) => (x / I.gdp) * 100;
  const [y, m] = bd.ym.split('-').map(Number);
  return {
    sector: 'SP', sectorLabel: 'Sector público (indicador oficial consolidado)', quarter: bd.ym,
    asOf: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    total: pct(I.total), fx: pct(I.total), lc: 0, domCred: pct(I.int), extCred: pct(I.ext), st: null, ltDue: null,
    fxShare: 100, extShare: (I.ext / I.total) * 100,
    due12m: M ? pct(M.due12m) : null, due12mShare: M ? (M.due12m / I.total) * 100 : null, due12mPartial: false,
    dollarized: true, maturities: M, source: 'Ministerio de Economía y Finanzas de Ecuador, Boletín de Deuda Pública', url: EC_DEBT_PAGE,
    note: 'Dato propio del Ministerio de Economía y Finanzas (Ecuador no reporta a QPSD). Dolarizado: toda la deuda es en dólares, moneda que no emite. ' +
      'Vencimientos = capital de la deuda pública de los próximos 12 meses según el perfil oficial (no incluye otras obligaciones de corto plazo como CETES).',
  };
}
