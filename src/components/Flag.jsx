import { FLAG_ISO } from '../format.js';

/** Bandera como imagen SVG (flagcdn). Mundo y Agenda usan íconos propios. */
export function Flag({ id, size }) {
  if (id === 'world')
    return (
      <svg className="flag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </svg>
    );
  if (id === 'agenda')
    return (
      <svg className="flag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    );
  const iso = FLAG_ISO[id];
  if (!iso) return null;
  return <img className="flag-img" src={`https://flagcdn.com/${iso}.svg`} alt="" style={size ? { width: size, height: size * 0.7 } : undefined} />;
}
