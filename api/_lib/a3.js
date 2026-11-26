// A3 Mercados (ex MAE/Matba Rofex): dólar UST$T (contado, liquidación T) desde el stream público de su portada.
// GET https://a3mercados.com.ar/api/market-data/stream?streams=Dashboard (Server-Sent Events). El primer evento "snapshot" trae
// data.totals con UST$T000 (value, variation en % contra el cierre anterior, date), BCRACOM3500 (A3500) y DOLARMTR (dólar A3).
// Sin operaciones en el día (antes de la apertura), UST$T000 viene con value 0 y date 0001-01-01: la portada de A3 muestra "ARS –".
// No hay endpoint con el cierre anterior del UST$T (/api/market-data/dollar-refs solo trae BCRA y MATBA).

export const A3_STREAM = 'https://a3mercados.com.ar/api/market-data/stream?streams=Dashboard';
export const A3_PAGE = 'https://a3mercados.com.ar/';

/** Texto SSE → primer evento "snapshot" parseado (o null). */
export function parseSnapshot(text) {
  for (const block of text.split(/\n\n/)) {
    if (!/^event: snapshot/m.test(block)) continue;
    const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
    try {
      const j = JSON.parse(data);
      return j?.data ?? j;
    } catch { /* bloque incompleto */ }
  }
  return null;
}

/** Lee el stream hasta el primer snapshot y corta. */
export async function a3Snapshot({ timeout = 10000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(A3_STREAM, { headers: { Accept: 'text/event-stream', 'User-Agent': 'Mozilla/5.0 (macro-dashboard)' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} en a3mercados.com.ar`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const snap = /event: snapshot[\s\S]*?\n\n/.test(buf) ? parseSnapshot(buf) : null;
      if (snap) { ctl.abort(); return snap; }
      if (buf.length > 2e6) break;
    }
    throw new Error('A3: el stream no envió el snapshot');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dólar para la vista Mundo: UST$T si operó en el día; si no, el A3500 del BCRA (mismo snapshot), rotulado.
 * Devuelve { last, d1, prevClose, date, label, source }.
 */
export function a3Dollar(snap) {
  const t = (id) => (snap?.totals || []).find((x) => x.id === id);
  const pick = (x, label) => x && x.value > 0 && {
    last: x.value, d1: x.variation, prevClose: x.value / (1 + x.variation / 100), date: String(x.date).slice(0, 10), label,
  };
  const ust = pick(t('UST$T000'), 'UST$T (A3)');
  if (ust) return { ...ust, source: 'A3 Mercados, dólar UST$T' };
  const bcra = pick(t('BCRACOM3500'), 'A3500 (BCRA)');
  if (bcra) return { ...bcra, source: 'A3 Mercados: UST$T sin operaciones hoy, se muestra el A3500 del BCRA' };
  throw new Error('A3: sin UST$T ni A3500 en el snapshot');
}
