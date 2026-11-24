// Calendario económico con dato real, consenso y anterior (estilo terminal).
// - Eventos, consenso ("forecast") y anterior: planilla semanal pública de Forex Factory (semana en curso, todas las monedas).
//   No trae el dato real.
// - Dato real de EE.UU.: FRED, con la misma transformación que el titular (m/m, a/a, variación en miles…). Solo se toma si la última
//   observación se publicó (realtime_start) el día del evento o después: así no se muestra el dato del mes anterior como si fuera el nuevo.
// - Licitaciones del Tesoro de la semana (Forex Factory no siempre las trae): corte y bid-to-cover reales (TreasuryDirect); como esperado,
//   el bid-to-cover promedio de las últimas 6 licitaciones del mismo plazo; anterior = la licitación previa del mismo plazo.
import { getJson, settle } from '../util.js';
import { fredGet } from './us.js';
import { treasuryAuctionsRaw, auctionHistory } from '../treasury.js';
import { officialActual } from '../officialActuals.js';
import { brazilInflation, argentinaInflation } from '../latamCal.js';

export const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const FF_PAGE = 'https://www.forexfactory.com/calendar';
const CCY_FLAG = { USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', CAD: 'ca', AUD: 'au', NZD: 'nz', CHF: 'ch', CNY: 'cn', BRL: 'br', ARS: 'ar' };

// Títulos de Forex Factory → serie de FRED y transformación. unit: formato del titular.
const t = (series, fn, extra = {}) => ({ series, fn, ...extra });
export const US_ACTUALS = [
  [/^Non-Farm Employment Change$/, t('PAYEMS', 'diff', { scale: 1 })], // miles → "K"
  [/^ADP Non-Farm Employment Change$/, t('ADPMNUSNERSA', 'diff', { scale: 1e-3 })], // personas → miles
  [/^Unemployment Rate$/, t('UNRATE', 'level')],
  [/^Average Hourly Earnings m\/m$/, t('CES0500000003', 'mom')],
  [/^CPI m\/m$/, t('CPIAUCSL', 'mom')],
  [/^Core CPI m\/m$/, t('CPILFESL', 'mom')],
  [/^CPI y\/y$/, t('CPIAUCNS', 'yoy')],
  [/^Core CPI y\/y$/, t('CPILFENS', 'yoy')],
  [/^PPI m\/m$/, t('PPIFIS', 'mom')],
  [/^Core PPI m\/m$/, t('PPIFES', 'mom')],
  [/^Core PCE Price Index m\/m$/, t('PCEPILFE', 'mom')],
  [/^PCE Price Index m\/m$/, t('PCEPI', 'mom')],
  [/^Core PCE Price Index y\/y$/, t('PCEPILFE', 'yoy')],
  [/^PCE Price Index y\/y$/, t('PCEPI', 'yoy')],
  [/^(Advance |Prelim |Final )?GDP q\/q$/, t('A191RL1Q225SBEA', 'level')],
  [/^(Advance |Prelim |Final )?GDP Price Index q\/q$/, t('A191RI1Q225SBEA', 'level')],
  [/^Retail Sales m\/m$/, t('RSAFS', 'mom')],
  [/^Core Retail Sales m\/m$/, t('RSFSXMV', 'mom')],
  [/^Unemployment Claims$/, t('ICSA', 'level', { scale: 1e-3 })],
  [/^Building Permits$/, t('PERMIT', 'level', { scale: 1e-3 })], // miles → millones
  [/^Housing Starts$/, t('HOUST', 'level', { scale: 1e-3 })],
  [/^New Home Sales$/, t('HSN1F', 'level')],
  [/^Existing Home Sales$/, t('EXHOSLUSM495S', 'level', { scale: 1e-6 })],
  [/^Durable Goods Orders m\/m$/, t('DGORDER', 'mom')],
  [/^Core Durable Goods Orders m\/m$/, t('ADXTNO', 'mom')],
  [/^JOLTS Job Openings$/, t('JTSJOL', 'level', { scale: 1e-3 })],
  [/^Empire State Manufacturing Index$/, t('GACDINA066MNFRBNY', 'level')],
  [/^Philly Fed Manufacturing Index$/, t('GACDFSA066MSFRBPHI', 'level')],
  [/^Industrial Production m\/m$/, t('INDPRO', 'mom')],
  [/^Trade Balance$/, t('BOPGSTB', 'level', { scale: 1e-3 })], // millones → miles de millones
  [/^Personal Income m\/m$/, t('PI', 'mom')],
  [/^Personal Spending m\/m$/, t('PCE', 'mom')],
  [/^Employment Cost Index q\/q$/, t('ECIALLCIV', 'mom')],
  [/^HPI m\/m$/, t('HPIPONM226S', 'mom')],
  [/^S&P\/CS Composite-20 HPI y\/y$/, t('SPCS20RNSA', 'yoy')],
  // Michigan (UMCSENT) no: FRED la publica con un mes de atraso por licencia.
];

/** '0.3%' | '201K' | '-135.9B' | '92.4' → { v, unit, dec } (null si no hay número). */
export function parseNum(s) {
  const m = /^\s*([<>]?)(-?\d+(?:\.\d+)?)\s*(%|K|M|B|T)?\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  return { v: Number(m[2]), unit: m[3] || '', dec: (m[2].split('.')[1] || '').length };
}
const fmtLike = (v, ref) => `${v.toFixed(ref.dec)}${ref.unit}`;

/** Aplica la transformación a la serie de FRED (orden descendente: obs[0] es la última). */
export function transform(obs, fn) {
  const v = (i) => Number(obs[i]?.value);
  if (fn === 'level') return v(0);
  if (fn === 'diff') return v(0) - v(1);
  if (fn === 'mom') return (v(0) / v(1) - 1) * 100;
  if (fn === 'yoy') return (v(0) / v(12) - 1) * 100;
  throw new Error(`transformación desconocida ${fn}`);
}

/** Hora de Nueva York → ISO con el desvío correcto (EST/EDT) para esa fecha. */
export function etIso(date, hhmm) {
  const guess = new Date(`${date}T${hhmm}:00-05:00`);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(guess).find((p) => p.type === 'timeZoneName')?.value; // "GMT-5"
  const h = Number(/GMT([+-]\d+)/.exec(off)?.[1] ?? -5);
  return new Date(`${date}T${hhmm}:00${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`).toISOString();
}
const etDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso)); // AAAA-MM-DD

/** Dato real de EE.UU. desde FRED para un evento ya publicado. */
async function usActual(ev, map, cache) {
  const key = map.series;
  if (!cache.has(key)) {
    cache.set(key, fredGet(`https://api.stlouisfed.org/fred/series/observations?series_id=${key}&api_key=${process.env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=14`)
      .then((j) => (j.observations || []).filter((o) => o.value !== '.')));
  }
  const obs = await cache.get(key);
  if (!obs.length || obs[0].realtime_start < etDate(ev.time)) return null; // FRED todavía no tiene el dato nuevo
  const raw = transform(obs, map.fn) * (map.scale ?? 1);
  return { raw, period: obs[0].date, series: key, url: `https://fred.stlouisfed.org/series/${key}` };
}

export function ffEvents(list) {
  return list.map((x, i) => ({
    id: `ff-${i}-${x.title}`, time: new Date(x.date).toISOString(), ccy: x.country, flag: CCY_FLAG[x.country] || null,
    title: x.title, impact: { High: 'high', Medium: 'medium', Low: 'low', Holiday: 'holiday' }[x.impact] || 'low',
    forecast: x.forecast || null, previous: x.previous || null, actual: null, kind: 'data',
  }));
}

/** Agrega dato real y sorpresa (dato − consenso, en las unidades del titular). */
export function withSurprise(ev, actualRaw) {
  const ref = parseNum(ev.forecast) || parseNum(ev.previous) || { unit: '', dec: 1 };
  const actual = fmtLike(actualRaw, ref);
  const f = parseNum(ev.forecast);
  const a = parseNum(actual);
  const diff = f && a ? +(a.v - f.v).toFixed(Math.max(f.dec, 1)) : null;
  return { ...ev, actual, surprise: diff == null ? null : { diff, unit: ref.unit, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' } };
}

/** Licitaciones de la semana como filas del calendario. */
export function auctionRows(tentative, td, hist, from, to) {
  const key = (x) => `${x.type}|${x.term}`;
  const tdBy = new Map(td.map((x) => [`${x.date}|${key(x)}`, x]));
  return tentative.filter((a) => a.date >= from && a.date <= to).map((a) => {
    const x = tdBy.get(`${a.date}|${key(a)}`);
    const past = hist.filter((h) => key(h) === key(a) && h.date < a.date).sort((p, q) => (p.date < q.date ? 1 : -1));
    const last6 = past.slice(0, 6).filter((h) => h.btc != null);
    const avgBtc = last6.length ? last6.reduce((s, h) => s + h.btc, 0) / last6.length : null;
    const rate = (h) => (h?.rate != null ? `${a.type === 'FRN' ? 'DM ' : ''}${h.rate.toFixed(3)}%` : null);
    const name = `${a.term} ${{ NOTE: 'Note', BOND: 'Bond', TIPS: 'TIPS', FRN: 'FRN' }[a.type]} Auction${a.reopening ? ' (reapertura)' : ''}`;
    const btcDiff = x?.btc != null && avgBtc != null ? +(x.btc - avgBtc).toFixed(2) : null;
    return {
      id: `auct-${a.date}-${key(a)}`, time: etIso(a.date, x?.closeTime || '13:00'), timeKnown: !!x?.closeTime, ccy: 'USD', flag: 'us', impact: 'medium', kind: 'auct',
      title: name, offering: x?.offering ?? null,
      actual: x?.btc != null ? `${rate(x) ?? ''} · BTC ${x.btc.toFixed(2)}` : null,
      forecast: avgBtc != null ? `BTC ${avgBtc.toFixed(2)}` : null, forecastNote: `bid-to-cover promedio de las últimas ${last6.length} licitaciones`,
      previous: past[0] ? `${rate(past[0]) ?? ''} · BTC ${past[0].btc?.toFixed(2) ?? '—'}` : null, previousDate: past[0]?.date ?? null,
      surprise: btcDiff == null ? null : { diff: btcDiff, unit: '', dir: btcDiff > 0 ? 'up' : btcDiff < 0 ? 'down' : 'flat', label: 'BTC vs promedio' },
      url: 'https://www.treasurydirect.gov/auctions/announcements-data-results/',
    };
  });
}

export default async function cal() {
  const errors = [];
  const d = await settle(
    {
      'Forex Factory': () => getJson(FF_URL, { timeout: 15000 }),
      'Tesoro (licitaciones)': () => treasuryAuctionsRaw(),
      'Tesoro (historia)': () => auctionHistory(),
    },
    errors
  );
  const list = d['Forex Factory'] || [];
  let events = ffEvents(list);
  // Dato real de EE.UU. (solo eventos ya ocurridos con serie en FRED; de a 4 pedidos).
  const cache = new Map();
  const now = Date.now();
  const todo = events.map((e, i) => [e, i]).filter(([e]) => e.ccy === 'USD' && Date.parse(e.time) <= now).map(([e, i]) => [e, i, US_ACTUALS.find(([re]) => re.test(e.title))?.[1]]).filter(([, , m]) => m);
  if (todo.length && !process.env.FRED_API_KEY) errors.push({ source: 'FRED (dato real de EE.UU.)', message: 'Falta FRED_API_KEY' });
  else {
    for (let k = 0; k < todo.length; k += 4) {
      await Promise.all(todo.slice(k, k + 4).map(async ([e, i, m]) => {
        try {
          const a = await usActual(e, m, cache);
          if (a) events[i] = { ...withSurprise(e, a.raw), actualSrc: `FRED ${a.series} (${a.period.slice(0, 7)})`, actualUrl: a.url };
        } catch (err) {
          if (!errors.some((x) => x.source === `FRED ${m.series}`)) errors.push({ source: `FRED ${m.series}`, message: err.message });
        }
      }));
    }
  }
  // Dato real oficial fuera de EE.UU. (StatCan, ONS, BCE, Eurostat), para los eventos ya ocurridos con mapa.
  const other = events.map((e, i) => [e, i]).filter(([e]) => e.ccy !== 'USD' && Date.parse(e.time) <= now);
  for (let k = 0; k < other.length; k += 4) {
    await Promise.all(other.slice(k, k + 4).map(async ([e, i]) => {
      try {
        const a = await officialActual(e);
        if (a) events[i] = { ...withSurprise(e, a.raw), actualSrc: `${a.src} (${a.period})`, actualUrl: a.url };
      } catch (err) {
        const src = `Dato oficial ${e.ccy} (${e.title})`;
        if (!errors.some((x) => x.source === src)) errors.push({ source: src, message: err.message });
      }
    }));
  }
  // América Latina (Forex Factory no la cubre): IPCA/IPCA-15 de Brasil e IPC de Argentina en la semana, con consenso Focus/REM.
  const span = events.map((e) => etDate(e.time)).sort();
  if (span.length) {
    const lat = await settle({
      'Brasil: IPCA (IBGE, Focus, SGS)': () => brazilInflation(span[0], span.at(-1)),
      'Argentina: IPC (INDEC, REM, BCRA)': () => argentinaInflation(span[0], span.at(-1)),
    }, errors);
    events = events.concat(...Object.values(lat).filter(Array.isArray));
  }
  // Licitaciones del Tesoro en el rango de la semana de Forex Factory.
  const raw = d['Tesoro (licitaciones)'];
  if (raw && events.length) {
    const days = events.map((e) => etDate(e.time)).sort();
    events = events.concat(auctionRows(raw.tentative, raw.td, d['Tesoro (historia)'] || [], days[0], days.at(-1)));
  }
  events.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return {
    id: 'cal', name: 'Calendario económico', events,
    sources: { consensus: { label: 'Forex Factory', url: FF_PAGE }, official: 'StatCan, ONS, BCE, Eurostat, IBGE/BCB, INDEC/BCRA', actualUs: { label: 'FRED', url: 'https://fred.stlouisfed.org/' }, auctions: { label: 'TreasuryDirect', url: 'https://www.treasurydirect.gov/auctions/upcoming/' } },
    errors,
  };
}
