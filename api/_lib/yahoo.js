// Yahoo Finance (endpoint chart no oficial; el mismo que usás en portfolio-terminal).
import { getJson, iso, clean, last, valueAt } from './util.js';

export async function yahooSeries(ticker, range = '1y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  const j = await getJson(url);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`Yahoo sin datos para ${ticker}`);
  const ts = r.timestamp || [];
  const close = r.indicators?.quote?.[0]?.close || [];
  const s = clean(ts.map((t, i) => ({ d: iso(new Date(t * 1000)), v: close[i] })));
  // el precio de mercado intradía suele ser más fresco que el último close
  const live = r.meta?.regularMarketPrice;
  const liveD = r.meta?.regularMarketTime ? iso(new Date(r.meta.regularMarketTime * 1000)) : null;
  if (Number.isFinite(live) && liveD) {
    if (last(s)?.d === liveD) last(s).v = live;
    else if (!last(s) || liveD > last(s).d) s.push({ d: liveD, v: live });
  }
  return s;
}

/**
 * Cierre anterior que Yahoo usa para la variación del día (meta.previousClose de range=1d).
 * En monedas (=X) las barras diarias de range=1y no sirven para eso: la barra "de ayer" no es el cierre anterior de Yahoo
 * (USDMXN el 25-nov-2026: barra 19,17 vs cierre anterior 19,41 → +2,2% en lugar de +1,0%).
 */
export async function yahooPrevClose(ticker) {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`);
  const m = j?.chart?.result?.[0]?.meta;
  const v = m?.previousClose ?? m?.chartPreviousClose;
  if (!Number.isFinite(v)) throw new Error(`Yahoo sin cierre anterior para ${ticker}`);
  return v;
}

/** Resumen de performance: último, 1d, MTD, YTD, 1a. */
export function perf(series) {
  const p = last(series);
  if (!p) return null;
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const y = p.d.slice(0, 4);
  const ytdBase = valueAt(series, `${Number(y) - 1}-12-31`);
  const mtdBase = valueAt(series, iso(new Date(new Date(p.d.slice(0, 8) + '01').getTime() - 864e5)));
  const pct = (b) => (b ? (p.v / b.v - 1) * 100 : null);
  return { last: p.v, date: p.d, d1: pct(prev), mtd: pct(mtdBase), ytd: pct(ytdBase), y1: pct(series[0]) };
}

/** Bloque "índice" para un país: ETF MSCI (proxy) + índice local. */
export async function equityBlock(msciTicker, msciLabel, localTicker, localLabel) {
  const [m, l] = await Promise.all([
    yahooSeries(msciTicker).catch(() => null),
    yahooSeries(localTicker).catch(() => null),
  ]);
  if (!m && !l) throw new Error(`Yahoo no respondió para ${msciTicker} ni ${localTicker}`);
  return {
    msci: m ? { ticker: msciTicker, label: msciLabel, series: m, perf: perf(m) } : null,
    local: l ? { ticker: localTicker, label: localLabel, series: l, perf: perf(l) } : null,
  };
}

/**
 * Futuros de Fed Funds a 30 días (CBOT, ZQ). Tasa implícita = 100 − precio.
 * Ticker Yahoo por contrato: ZQ{mes}{aa}.CBT (p.ej. ZQF27.CBT).
 */
export async function fedFundsStrip(months = 12) {
  const codes = 'FGHJKMNQUVXZ';
  const now = new Date();
  const contracts = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const yy = String(d.getUTCFullYear()).slice(2);
    contracts.push({ month: iso(d).slice(0, 7), ticker: `ZQ${codes[d.getUTCMonth()]}${yy}.CBT` });
  }
  const res = await Promise.all(
    contracts.map(async (c) => {
      try {
        const s = await yahooSeries(c.ticker, '5d');
        const p = last(s);
        return p ? { ...c, price: p.v, implied: 100 - p.v, date: p.d } : null;
      } catch {
        return null;
      }
    })
  );
  const ok = res.filter(Boolean);
  if (!ok.length) throw new Error('Sin cotizaciones de futuros ZQ en Yahoo');
  return ok;
}

/** Historia (1 año) de la tasa implícita de un contrato ZQ fijo, ~n meses adelante. */
export async function fedFundsContractHistory(monthsAhead = 12) {
  const codes = 'FGHJKMNQUVXZ';
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead, 1));
  const ticker = `ZQ${codes[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}.CBT`;
  const s = await yahooSeries(ticker, '1y');
  if (!s.length) throw new Error(`Sin historia para ${ticker}`);
  return { ticker, month: iso(d).slice(0, 7), series: s.map((p) => ({ d: p.d, v: 100 - p.v })) };
}
