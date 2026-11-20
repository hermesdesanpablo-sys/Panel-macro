// Composición de la deuda pública: Banco Mundial, Quarterly Public Sector Debt (QPSD, fuente 20 de la API, sin clave).
// Trimestral, en % del PBI. Se usa el gobierno central (CG) porque es la cobertura que más países publican de forma completa;
// si un país solo reporta el presupuestario central (BC, p.ej. Chile) se usa ese y se avisa. Los datos los cargan los
// ministerios de finanzas / bancos centrales de cada país: perímetro y criterio de residencia pueden variar.
import { getJson } from './util.js';

export const QPSD_URL = 'https://www.worldbank.org/en/programs/debt-statistics/qpsd';
const API = 'https://api.worldbank.org/v2/country';

// Indicadores (todos "Nominal Value, % of GDP"). DLTC.CR.L1 = deuda de largo plazo que vence en los próximos 12 meses.
const IND = {
  total: (s) => `DP.DOD.DECT.CR.${s}.Z1`,
  fx: (s) => `DP.DOD.DECF.CR.${s}.Z1`, // en moneda extranjera
  lc: (s) => `DP.DOD.DECN.CR.${s}.Z1`, // en moneda local
  domCred: (s) => `DP.DOD.DECD.CR.${s}.Z1`, // acreedores residentes
  extCred: (s) => `DP.DOD.DECX.CR.${s}.Z1`, // acreedores no residentes
  st: (s) => `DP.DOD.DSTC.CR.${s}.Z1`, // corto plazo (plazo original ≤ 1 año)
  ltDue: (s) => `DP.DOD.DLTC.CR.L1.${s}.Z1`, // largo plazo con vencimiento en ≤ 1 año
};
export const SECTOR_LABEL = { GG: 'Gobierno general', CG: 'Gobierno central', BC: 'Gobierno central presupuestario' };

/** "2026Q2" → "2026-06-30" (fin del trimestre). */
export const quarterEnd = (q) => {
  const m = String(q).match(/^(\d{4})Q([1-4])$/);
  return m ? `${m[1]}-${['03-31', '06-30', '09-30', '12-31'][m[2] - 1]}` : null;
};

/** Respuesta de la API → { ISO3: { v, q } } con el último dato no vacío. */
export function parseWbLatest(j) {
  const out = {};
  for (const x of (Array.isArray(j) ? j[1] : null) || []) {
    if (x.value == null) continue;
    const cur = out[x.countryiso3code];
    if (!cur || x.date > cur.q) out[x.countryiso3code] = { v: x.value, q: x.date };
  }
  return out;
}

async function latest(codes, id) {
  try {
    return parseWbLatest(await getJson(`${API}/${codes.join(';')}/indicator/${id}?source=20&format=json&mrnev=1&per_page=500`, { timeout: 30000 }));
  } catch (e) {
    // 400 = el indicador no existe para ese sector (p.ej. corto plazo del presupuestario central): componente vacío.
    if (/HTTP 400/.test(e.message)) return {};
    throw e;
  }
}

/**
 * Composición por país. `countries`: [{ id, wb }]; `sectorFor` permite forzar un sector por país (p.ej. { CHL: 'BC' }).
 * Devuelve { [id]: { sector, sectorLabel, asOf, total, fx, lc, domCred, extCred, st, ltDue, fxShare, extShare, due12m, due12mShare, notes } }.
 * Solo se usan componentes del MISMO trimestre que el total (si no, quedan null).
 */
export async function debtComposition(countries, sectorFor = {}) {
  const bySector = {};
  for (const c of countries) (bySector[sectorFor[c.wb] || 'CG'] ??= []).push(c);
  const out = {};
  for (const [sec, list] of Object.entries(bySector)) {
    const codes = list.map((c) => c.wb);
    const data = {};
    // Secuencial: la API del Banco Mundial corta con muchas consultas simultáneas.
    for (const [k, f] of Object.entries(IND)) data[k] = await latest(codes, f(sec));
    for (const c of list) {
      const t = data.total[c.wb];
      if (!t) continue;
      const same = (k) => (data[k][c.wb]?.q === t.q ? data[k][c.wb].v : null);
      const r = { total: t.v, fx: same('fx'), lc: same('lc'), domCred: same('domCred'), extCred: same('extCred'), st: same('st'), ltDue: same('ltDue') };
      const share = (x) => (x == null || !t.v ? null : (x / t.v) * 100);
      const due12m = r.st != null || r.ltDue != null ? (r.st ?? 0) + (r.ltDue ?? 0) : null;
      out[c.id] = {
        sector: sec, sectorLabel: SECTOR_LABEL[sec], quarter: t.q, asOf: quarterEnd(t.q), ...r,
        fxShare: share(r.fx), extShare: share(r.extCred), due12m, due12mShare: share(due12m),
        due12mPartial: due12m != null && (r.st == null || r.ltDue == null),
      };
    }
  }
  return out;
}
