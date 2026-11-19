// BIS (Bank for International Settlements), API SDMX sin clave: tasas de política (WS_CBPOL) e IPC (WS_LONG_CPI).
import { getText, clean, iso } from './util.js';

const BIS_API = 'https://stats.bis.org/api/v2/data/dataflow/BIS';
export const BIS_URL = { cbpol: 'https://data.bis.org/topics/CBPOL', cpi: 'https://data.bis.org/topics/CPI' };

/**
 * CSV del BIS → [{d, v}]. Algunos campos de texto (notas de la serie) traen comas o punto y coma, así que en vez de
 * separar por columnas se toma, en cada fila, el par "fecha,valor" (AAAA-MM o AAAA-MM-DD). Los NaN (feriados) se descartan.
 */
export function parseBis(text) {
  const out = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const m = line.match(/,(\d{4}-\d{2}(?:-\d{2})?),(-?[\d.]+|NaN),/);
    if (m) out.push({ d: m[1].length === 7 ? `${m[1]}-01` : m[1], v: parseFloat(m[2]) });
  }
  return clean(out);
}

/** flow: 'WS_CBPOL' (key 'D.PE') o 'WS_LONG_CPI' (key 'M.PE.771' = IPC a/a). */
export async function bis(flow, key, from) {
  const start = iso(from).slice(0, flow === 'WS_CBPOL' ? 10 : 7);
  return parseBis(await getText(`${BIS_API}/${flow}/1.0/${key}?startPeriod=${start}&format=csv`, { timeout: 25000 }));
}
