import { useEffect, useState, useCallback } from 'react';
import { CountryPanel, WorldPanel, AgendaList } from './components/Panels.jsx';
import { fmtDate } from './format.js';

const TABS = [
  { id: 'world', label: 'Mundo', flag: '🌐' },
  { id: 'br', label: 'Brasil', flag: '🇧🇷' },
  { id: 'us', label: 'EE.UU.', flag: '🇺🇸' },
  { id: 'eu', label: 'Eurozona', flag: '🇪🇺' },
  { id: 'mx', label: 'México', flag: '🇲🇽' },
  { id: 'ca', label: 'Canadá', flag: '🇨🇦' },
  { id: 'co', label: 'Colombia', flag: '🇨🇴' },
  { id: 'agenda', label: 'Agenda', flag: '📅' },
];
const COUNTRIES = ['br', 'us', 'eu', 'mx', 'ca', 'co'];
const MOCK = new URLSearchParams(location.search).has('mock');

async function load(id) {
  if (MOCK) {
    const all = (await import('./mock-data.json')).default;
    return all[id];
  }
  const r = await fetch(`/api/country?c=${id}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export default function App() {
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'world'));
  const [data, setData] = useState({});
  const [state, setState] = useState({});

  const fetchOne = useCallback(async (id) => {
    setState((s) => ({ ...s, [id]: 'loading' }));
    try {
      const p = await load(id);
      setData((d) => ({ ...d, [id]: p }));
      setState((s) => ({ ...s, [id]: 'ok' }));
    } catch (e) {
      setState((s) => ({ ...s, [id]: String(e.message || e) }));
    }
  }, []);
  const fetchAll = useCallback(() => ['world', ...COUNTRIES].forEach(fetchOne), [fetchOne]);

  useEffect(fetchAll, [fetchAll]);
  useEffect(() => {
    const onHash = () => TABS.some((t) => t.id === location.hash.slice(1)) && setTab(location.hash.slice(1));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id) => {
    setTab(id);
    history.replaceState(null, '', `#${id}`);
  };

  const countries = COUNTRIES.map((c) => data[c]).filter(Boolean);
  const agenda = countries
    .flatMap((p) => (p.calendar || []).map((e) => ({ ...e, flag: p.flag })))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const current = data[tab];
  const st = state[tab];
  const updated = current?.updatedAt || data.world?.updatedAt;

  return (
    <div className="viz-root app">
      <header className="top">
        <div className="brand">
          Macro Monitor
          {MOCK && <span className="mock-badge">DATOS DE EJEMPLO – no reales</span>}
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
              <span className="flag">{t.flag}</span> {t.label}
              {state[t.id] === 'loading' && <span className="dot" />}
            </button>
          ))}
        </nav>
        <div className="actions">
          {updated && <span className="muted">Actualizado {fmtDate(updated.slice(0, 10))} {updated.slice(11, 16)} UTC</span>}
          <button className="btn" onClick={fetchAll}>Recargar</button>
        </div>
      </header>

      <main>
        {tab !== 'agenda' && current && (
          <h2 className="title">
            {current.flag} {current.name}
            {current.currency && <span className="muted"> · {current.currency}</span>}
          </h2>
        )}
        {tab === 'agenda' ? (
          <section className="card" id="agenda-all">
            <h2 className="title">📅 Agenda consolidada</h2>
            <AgendaList events={agenda} showFlag />
          </section>
        ) : !current ? (
          <div className="empty big">{st && st !== 'loading' ? `Error: ${st}` : 'Cargando…'}</div>
        ) : tab === 'world' ? (
          <WorldPanel world={current} countries={countries} />
        ) : (
          <CountryPanel p={current} />
        )}
      </main>
    </div>
  );
}
