import { FLAG_ISO } from '../format.js';

const ICONS = {
  world: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  agenda: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  compare: <path d="M7 4v16M17 4v16M4 8h6M14 16h6M4 8l3-3 3 3M14 16l3 3 3-3" />,
  cmd: <path d="M12 3l7 6-7 12L5 9l7-6zM5 9h14" />,
  sust: <path d="M12 3v18M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6zM8 21h8" />,
  val: <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8M5 9l5-4 4 3 5-4" />,
  usd: <path d="M12 3v18M16.5 7.5c-.8-1.4-2.5-2.2-4.5-2.2-2.6 0-4.5 1.4-4.5 3.3 0 4.4 9.2 2.4 9.2 6.9 0 2-2 3.4-4.7 3.4-2.2 0-4-.9-4.8-2.4" />,
};

/**
 * Bandera como imagen SVG (flagcdn) o ícono propio (Mundo, Agenda, Comparar, commodities).
 * `id` puede ser un id de panel (br, eu, jp…) o un código ISO-2 (de, gb, cn…). `round` = insignia circular.
 */
export function Flag({ id, round = false, size }) {
  if (ICONS[id])
    return (
      <svg className={round ? 'flag-round flag-round-icon' : 'flag-icon'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"
        style={size ? { width: size, height: size } : undefined}>
        {ICONS[id]}
      </svg>
    );
  const iso = FLAG_ISO[id] || (/^[a-z]{2}$/.test(id || '') ? id : null);
  if (!iso) return null;
  return (
    <img className={round ? 'flag-round' : 'flag-img'} src={`https://flagcdn.com/${iso}.svg`} alt="" loading="lazy"
      style={size ? (round ? { width: size, height: size } : { width: size, height: size * 0.7 }) : undefined} />
  );
}
