export const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fmtNum(v, decimals = 2) {
  if (v == null || !Number.isFinite(v)) return 'n/d';
  return v.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
export function fmtPct(v, decimals = 1, sign = true) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${sign && v > 0 ? '+' : ''}${fmtNum(v, decimals)}%`;
}
export function fmtDate(iso, withYear = true) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MES[Number(m) - 1]}${withYear ? ` ${y.slice(2)}` : ''}`;
}
export const fmtMonth = (iso) => (iso ? `${MES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}` : '');

export function daysUntil(iso) {
  const t = new Date(iso + 'T12:00:00Z').getTime() - Date.now();
  return Math.ceil(t / 864e5);
}

export function kpiByKey(payload, key) {
  return payload?.kpis?.find((k) => k.key === key) || null;
}

/** Variación formateada según su unidad: 'pb' (tasas) o '%' (niveles). */
export function fmtChg(v, unit = 'pb') {
  if (v == null || !Number.isFinite(v)) return '—';
  v = unit === 'pb' ? Math.round(v) : Math.round(v * 10) / 10;
  if (Object.is(v, -0)) v = 0;
  const s = v > 0 ? '+' : '';
  return unit === 'pb' ? `${s}${fmtNum(v, 0)} pb` : `${s}${fmtNum(v, 1)}%`;
}
export const ARROW = { up: '▲', down: '▼', flat: '■' };

/** Dirección de una variación con umbral de ruido: 1 pb para tasas, 0,05% para niveles. */
export function chgDir(v, unit = 'pb') {
  if (v == null || !Number.isFinite(v)) return null;
  const th = unit === 'pb' ? 1 : 0.05;
  return v > th ? 'up' : v < -th ? 'down' : 'flat';
}

// ISO-2 para las banderas SVG (los emoji de bandera no se ven en Windows).
export const FLAG_ISO = { br: 'br', us: 'us', eu: 'eu', mx: 'mx', ca: 'ca', co: 'co', cl: 'cl', jp: 'jp', ar: 'ar', pe: 'pe', in: 'in', cn: 'cn' };
export const DIR_WORD = { up: 'sube', down: 'baja', flat: 'estable' };

export const GROUPS = [
  { id: 'policy', label: 'Política monetaria' },
  { id: 'inflation', label: 'Inflación' },
  { id: 'expectations', label: 'Expectativas' },
  { id: 'market', label: 'Tasas de mercado' },
  { id: 'fx', label: 'Tipo de cambio' },
  { id: 'activity', label: 'Actividad' },
];
