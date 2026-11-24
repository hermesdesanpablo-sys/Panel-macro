// Licitaciones del Tesoro de EE.UU. (notas, bonos, TIPS y FRN; sin letras, que salen varias por semana).
// - Cronograma tentativo (PDF del Tesoro, ~3 meses): fechas de anuncio y de licitación.
// - TreasuryDirect TA_WS (sin clave): licitaciones anunciadas (monto, hora de cierre) y resultados recientes (tasa de corte, bid-to-cover).
import { extractText, getDocumentProxy } from 'unpdf';
import { getJson } from './util.js';

export const TENTATIVE_URL = 'https://home.treasury.gov/system/files/221/Tentative-Auction-Schedule.pdf';
const TD = 'https://www.treasurydirect.gov/TA_WS/securities';
const RESULTS_PAGE = 'https://www.treasurydirect.gov/auctions/upcoming/';
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const isoD = (s) => { const m = /(\w{3}) (\d{2}), (\d{4})/.exec(s); return m ? `${m[3]}-${String(MON[m[1]]).padStart(2, '0')}-${m[2]}` : null; };
const TYPE_ES = { NOTE: 'Nota', BOND: 'Bono', TIPS: 'TIPS', FRN: 'FRN' };

/** Texto del PDF tentativo → [{ term:'2-Year', type:'NOTE'|'BOND'|'TIPS'|'FRN', reopening, announce, date }]. */
export function parseTentative(text) {
  const out = [];
  const re = /(\d+-(?:Year|Week)) (NOTE|BOND|TIPS|FRN|BILL)((?: [RT])*) (\w{3}, \w{3} \d{2}, \d{4}) (\w{3}, \w{3} \d{2}, \d{4})/g;
  for (const m of text.matchAll(re)) {
    if (m[2] === 'BILL') continue;
    out.push({ term: m[1], type: m[2], reopening: / R/.test(m[3]), announce: isoD(m[4]), date: isoD(m[5]) });
  }
  if (!out.length) throw new Error('Cronograma tentativo del Tesoro: no se encontraron licitaciones (¿cambió el PDF?)');
  return out;
}

const tdType = (x) => (x.type === 'TIPS' || x.inflationProtected === 'Yes' ? 'TIPS' : x.floatingRate === 'Yes' || x.type === 'FRN' ? 'FRN' : String(x.securityType).toUpperCase());
const tdTerm = (x) => x.originalSecurityTerm || x.securityTerm;
const bn = (v) => `USD ${Math.round(Number(v) / 1e6).toLocaleString('es-AR')} M`;
const pct = (v, d = 3) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const time24 = (t) => { const m = /(\d{1,2}):(\d{2}) (AM|PM)/.exec(t || ''); if (!m) return ''; let h = Number(m[1]) % 12; if (m[3] === 'PM') h += 12; return `${String(h).padStart(2, '0')}:${m[2]} ET`; };

/** Une el cronograma tentativo con lo anunciado y lo ya licitado. Eventos de agenda (kind 'auct'). */
export function auctionEvents(tentative, announced = [], auctioned = []) {
  const td = [...announced, ...auctioned].map((x) => ({ ...x, _date: (x.auctionDate || x.competitiveAuctionCloseDate || '').slice(0, 10), _type: tdType(x), _term: tdTerm(x) }));
  return tentative.map((t) => {
    const x = td.find((a) => a._date === t.date && a._type === t.type && a._term === t.term);
    const name = `Tesoro – licitación ${t.term.replace('-Year', ' años').replace('-Week', ' semanas')} (${TYPE_ES[t.type]}${t.reopening ? ', reapertura' : ''})`;
    const bits = [];
    if (x?.offeringAmount) bits.push(bn(x.offeringAmount));
    if (x?.highYield || x?.highDiscountMargin) bits.push(x.highYield ? `corte ${pct(x.highYield)}%` : `margen ${pct(x.highDiscountMargin, 3)}%`);
    if (x?.bidToCoverRatio) bits.push(`bid-to-cover ${pct(x.bidToCoverRatio, 2)}`);
    else if (x?.competitiveAuctionCloseTime) bits.push(`cierre ${time24(x.competitiveAuctionCloseTime)}`);
    return {
      date: t.date, event: bits.length ? `${name} · ${bits.join(' · ')}` : `${name} · tentativa`, kind: 'auct',
      url: x?.highYield || x?.bidToCoverRatio ? 'https://www.treasurydirect.gov/auctions/announcements-data-results/' : x ? RESULTS_PAGE : TENTATIVE_URL,
      tentative: !x,
    };
  });
}

export async function treasuryAuctions() {
  const getPdf = async () => {
    const r = await fetch(TENTATIVE_URL, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} en el cronograma tentativo del Tesoro`);
    return r.arrayBuffer();
  };
  const [pdf, announced, auctioned] = await Promise.all([
    getPdf(),
    getJson(`${TD}/upcoming?format=json`).catch(() => []),
    getJson(`${TD}/auctioned?format=json&days=7`).catch(() => []),
  ]);
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
  return auctionEvents(parseTentative(text), announced, auctioned);
}
