import { useEffect, useRef, useState } from 'react';
import { Flag } from './Flag.jsx';

/**
 * Selector "Países" de la barra superior: un botón que abre la lista de países (menú desplegable).
 * Si hay un país abierto, el botón muestra su bandera y su nombre. Se cierra con Escape, al elegir o al hacer clic afuera.
 */
export function CountryMenu({ items, current, onPick, loading }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const sel = items.find((i) => i.id === current);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Foco en el país abierto (o el primero) para poder moverse con el teclado.
    ref.current?.querySelector('[aria-current="true"], [role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const onMenuKey = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const btns = [...ref.current.querySelectorAll('[role="menuitem"]')];
    const i = btns.indexOf(document.activeElement);
    btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
  };
  return (
    <div className="cmenu" ref={ref}>
      <button className={`cmenu-btn ${sel ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={(e) => {
        // Posición fija: la barra de solapas tiene scroll horizontal en celulares y recortaría un menú absoluto.
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 228)) });
        setOpen((o) => !o);
      }}>
        {sel ? <><Flag id={sel.id} /> {sel.label}</> : 'Países'}
        <span className="cmenu-caret" aria-hidden="true">▾</span>
        {loading && <span className="dot" />}
      </button>
      {open && (
        <div className="cmenu-list" role="menu" aria-label="Países" onKeyDown={onMenuKey} style={pos ? { top: pos.top, left: pos.left } : undefined}>
          {items.map((i) => (
            <button key={i.id} role="menuitem" aria-current={i.id === current} className={i.id === current ? 'on' : ''}
              onClick={() => { onPick(i.id); setOpen(false); }}>
              <Flag id={i.id} /> {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
