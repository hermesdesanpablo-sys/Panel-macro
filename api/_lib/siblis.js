// Siblis Research (página pública, actualización mensual): P/E trailing y forward de los 11 sectores de EE.UU. y crecimiento
// anualizado de las ganancias a 1, 3 y 5 años. La API gratis solo trae algunas fechas sueltas (la diaria es paga).
import { getText } from './util.js';

export const SIBLIS_URL = 'https://siblisresearch.com/data/sector-pe-earnings/';
const LONG = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };
const pct = (s) => (s == null || s === 'n/a' ? null : parseFloat(s.replace('−', '-').replace('%', '')));
const val = (s) => (s == null || s === 'n/a' ? null : parseFloat(s));

/** → { asOf, sectors: { 'Energy': { pe, peFwd, implied, g1, g3, g5 } } } */
export function parseSiblis(html) {
  const t = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '|').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#8722;|&minus;/g, '−').replace(/\s*\|[\s|]*/g, '|');
  const d = t.match(/Data through\|(\d{1,2}) ([A-Z][a-z]+) (\d{4})/);
  const i = t.indexOf('U.S. sectors: what they cost');
  if (i < 0) throw new Error('Siblis: no se encontró la tabla de sectores de EE.UU. (¿cambió la página?)');
  const seg = t.slice(i, t.indexOf('Implied|is the', i) > 0 ? t.indexOf('Implied|is the', i) : i + 4000);
  const N = '([\\d.]+|n/a)', P = '([+−-]?[\\d.]+%|n/a)';
  const sectors = {};
  for (const name of ['Communication Services', 'Consumer Discretionary', 'Consumer Staples', 'Energy', 'Financials', 'Health Care', 'Industrials',
    'Information Technology', 'Materials', 'Real Estate', 'Utilities']) {
    const m = seg.match(new RegExp(`\\|${name}\\|(?:[^|]*[a-z][^|]*\\|)?${N}\\|${N}\\|${P}\\|${P}\\|${P}\\|${P}`));
    if (m) sectors[name] = { pe: val(m[1]), peFwd: val(m[2]), implied: pct(m[3]), g1: pct(m[4]), g3: pct(m[5]), g5: pct(m[6]) };
  }
  if (!Object.keys(sectors).length) throw new Error('Siblis: tabla de sectores vacía');
  return { asOf: d ? `${d[3]}-${LONG[d[2]]}-${d[1].padStart(2, '0')}` : null, sectors };
}

export const siblisSectors = async () => parseSiblis(await getText(SIBLIS_URL, { timeout: 20000 }));
