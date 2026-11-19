// GET /api/country?c=br|us|eu|mx|ca|co|jp|world
// Devuelve un payload normalizado por país. Vercel cachea en el edge 30 min.
import br from './_lib/sources/br.js';
import us from './_lib/sources/us.js';
import eu from './_lib/sources/eu.js';
import mx from './_lib/sources/mx.js';
import ca from './_lib/sources/ca.js';
import co from './_lib/sources/co.js';
import jp from './_lib/sources/jp.js';
import world from './_lib/sources/world.js';

export const ADAPTERS = { br, us, eu, mx, ca, co, jp, world };

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
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
