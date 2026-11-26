// GET /api/country?c=ar|br|us|eu|mx|ca|co|cl|pe|jp|in|world|usd|sust|val|rank|news|cal|pair|pairs (pair: &a=<país>&b=<país>)
// Devuelve un payload normalizado por país. Vercel cachea en el edge 30 min.
import br from './_lib/sources/br.js';
import us from './_lib/sources/us.js';
import eu from './_lib/sources/eu.js';
import mx from './_lib/sources/mx.js';
import ca from './_lib/sources/ca.js';
import co from './_lib/sources/co.js';
import jp from './_lib/sources/jp.js';
import cl from './_lib/sources/cl.js';
import ar from './_lib/sources/ar.js';
import pe from './_lib/sources/pe.js';
import india from './_lib/sources/in.js';
import sust from './_lib/sources/sust.js';
import usd from './_lib/sources/usd.js';
import val from './_lib/sources/val.js';
import rank from './_lib/sources/rank.js';
import news from './_lib/sources/news.js';
import cal from './_lib/sources/cal.js';
import pair, { pairs } from './_lib/sources/pair.js';
import world from './_lib/sources/world.js';

import { politicalEvents } from './_lib/calendar.js';
import { upcoming } from './_lib/util.js';

// cal: 3 min (Forex Factory pide no bajar su planilla más de un par de veces cada 5 minutos).
const TTL = { world: 60, news: 60, cal: 180, pair: 900, pairs: 3600, usd: 900, sust: 21600, val: 3600, rank: 3600 };

/** Agrega a la agenda de cada país el calendario político (aparte del tope de 20 eventos económicos). */
const withPolitics = (id, fn) => async () => {
  const p = await fn();
  p.calendar = [...(p.calendar || []), ...upcoming(politicalEvents(id), 10)].sort((a, b) => (a.date < b.date ? -1 : 1));
  return p;
};
const COUNTRY_ADAPTERS = { ar, br, us, eu, mx, ca, co, cl, pe, jp, in: india };

export const ADAPTERS = {
  ...Object.fromEntries(Object.entries(COUNTRY_ADAPTERS).map(([id, fn]) => [id, withPolitics(id, fn)])),
  world,
  usd,
  sust,
  val,
  rank,
  news,
  cal,
  pair,
  pairs,
};

export default async function handler(req, res) {
  const qs = new URL(req.url, 'http://x').searchParams;
  const c = String(req.query?.c || qs.get('c') || '').toLowerCase();
  const fn = ADAPTERS[c];
  if (!fn) {
    res.status(400).json({ error: `País desconocido. Usar c=${Object.keys(ADAPTERS).join('|')}` });
    return;
  }
  try {
    const t0 = Date.now();
    const payload = await fn({ a: req.query?.a || qs.get('a'), b: req.query?.b || qs.get('b') });
    payload.updatedAt = new Date().toISOString();
    payload.ms = Date.now() - t0;
    // Caché del CDN según qué tan rápido cambia cada fuente (segundos). Precios: 1 minuto; paneles de país: 5 minutos;
    // bonos en USD: 15 minutos; valuación y flujos de ETF (diarios): 1 hora; Sostenibilidad (anual, FMI): 6 horas. "Recargar" agrega ?fresh=<timestamp> y no usa caché.
    // Si alguna fuente falló, la respuesta se guarda poco tiempo: que un fallo pasajero no quede 15 min (o 6 h) en el CDN.
    const ttl = payload.errors?.length ? Math.min(60, TTL[c] ?? 300) : TTL[c] ?? 300;
    // Precios (TTL ≤ 60 s): sin stale-while-revalidate, para que nunca se sirva una copia vencida.
    res.setHeader('Cache-Control', ttl <= 60 ? `s-maxage=${ttl}` : `s-maxage=${ttl}, stale-while-revalidate=${Math.min(ttl, 300)}`);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
