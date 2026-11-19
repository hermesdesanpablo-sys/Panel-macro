// GET /api/country?c=ar|br|us|eu|mx|ca|co|cl|jp|world|usd|sust
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
import sust from './_lib/sources/sust.js';
import usd from './_lib/sources/usd.js';
import world from './_lib/sources/world.js';

const TTL = { world: 60, usd: 900, sust: 21600 };

export const ADAPTERS = { ar, br, us, eu, mx, ca, co, cl, jp, world, usd, sust };

export default async function handler(req, res) {
  const c = String(req.query?.c || new URL(req.url, 'http://x').searchParams.get('c') || '').toLowerCase();
  const fn = ADAPTERS[c];
  if (!fn) {
    res.status(400).json({ error: `País desconocido. Usar c=${Object.keys(ADAPTERS).join('|')}` });
    return;
  }
  try {
    const t0 = Date.now();
    const payload = await fn();
    payload.updatedAt = new Date().toISOString();
    payload.ms = Date.now() - t0;
    // Caché del CDN según qué tan rápido cambia cada fuente (segundos). Precios: 1 minuto; paneles de país: 5 minutos;
    // bonos en USD: 15 minutos; Sostenibilidad (anual, FMI): 6 horas. "Recargar" agrega ?fresh=<timestamp> y no usa caché.
    const ttl = TTL[c] ?? 300;
    // Precios (TTL ≤ 60 s): sin stale-while-revalidate, para que nunca se sirva una copia vencida.
    res.setHeader('Cache-Control', ttl <= 60 ? `s-maxage=${ttl}` : `s-maxage=${ttl}, stale-while-revalidate=${Math.min(ttl, 300)}`);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
