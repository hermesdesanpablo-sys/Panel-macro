import { useEffect, useState, useCallback, useRef } from 'react';
import { CountryPanel, WorldPanel, AgendaPanel, ComparePanel, UsdPanel, SustPanel, ValPanel, RankPanel, NewsPanel, EconCalendar } from './components/Panels.jsx';
import { CountryMenu } from './components/CountryMenu.jsx';
import { POLITICAL_UNDATED } from '../api/_lib/calendar.js';
import { fmtDate } from './format.js';
import { Flag } from './components/Flag.jsx';

// Solapas generales en la barra; los países van en el selector "Países" para no ocupar espacio arriba.
const MAIN_TABS = [
  { id: 'world', label: 'Mundo' },
  { id: 'news', label: 'Noticias' },
  { id: 'usd', label: 'Crédito USD' },
  { id: 'sust', label: 'Sostenibilidad' },
  { id: 'val', label: 'Valuación' },
  { id: 'compare', label: 'Comparar' },
  { id: 'agenda', label: 'Agenda' },
];
const COUNTRY_TABS = [
  { id: 'ar', label: 'Argentina' },
  { id: 'br', label: 'Brasil' },
  { id: 'us', label: 'EE.UU.' },
  { id: 'eu', label: 'Eurozona' },
  { id: 'mx', label: 'México' },
  { id: 'ca', label: 'Canadá' },
  { id: 'co', label: 'Colombia' },
  { id: 'cl', label: 'Chile' },
  { id: 'pe', label: 'Perú' },
  { id: 'jp', label: 'Japón' },
  { id: 'in', label: 'India' },
];
const TABS = [...MAIN_TABS, ...COUNTRY_TABS];
const COUNTRIES = ['ar', 'br', 'us', 'eu', 'mx', 'ca', 'co', 'cl', 'pe', 'jp', 'in'];
const MOCK = new URLSearchParams(location.search).has('mock');

/** `fresh`: pide datos nuevos salteando la caché del CDN (botón Recargar). */
async function load(id, fresh = false) {
  if (MOCK) {
    const all = (await import('./mock-data.json')).default;
    return all[id];
  }
  const r = await fetch(`/api/country?c=${id}${fresh ? `&fresh=${Date.now()}` : ''}`, fresh ? { cache: 'no-store' } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

/** Agenda: subsolapas "Calendario económico" (semana, dato vs consenso) y "Agenda" (bancos centrales, datos y política, meses). */
function AgendaTabs({ cal, calState, agenda }) {
  const [sub, setSub] = useState(() => { try { return localStorage.getItem('agendaSub') || 'cal'; } catch { return 'cal'; } });
  const pick = (v) => { setSub(v); try { localStorage.setItem('agendaSub', v); } catch { /* sin almacenamiento */ } };
  return (
    <>
      <div className="subtabs">
        <div className="seg" role="tablist" aria-label="Agenda">
          {[['cal', 'Calendario económico'], ['agenda', 'Agenda (próximos meses)']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={sub === k} className={sub === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>
          ))}
        </div>
      </div>
      {sub === 'cal' ? (
        cal ? <EconCalendar data={cal} /> : <div className="empty big">{calState && calState !== 'loading' ? `Error: ${calState}` : 'Cargando…'}</div>
      ) : (
        <section className="card" id="agenda-all">
          <h2 className="title"><Flag id="agenda" /> Agenda consolidada</h2>
          <AgendaPanel events={agenda} undated={POLITICAL_UNDATED} />
        </section>
      )}
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'world'));
  const [data, setData] = useState({});
  // Países de la solapa Comparar (se recuerdan en el navegador; si no hay almacenamiento, BR vs MX).
  const stored = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const [cmpA, setCmpAState] = useState(() => stored('cmpA', 'br'));
  const [cmpB, setCmpBState] = useState(() => stored('cmpB', 'mx'));
  const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const setCmpA = (v) => { setCmpAState(v); keep('cmpA', v); };
  const setCmpB = (v) => { setCmpBState(v); keep('cmpB', v); };
  const [state, setState] = useState({});

  const fetchOne = useCallback(async (id, fresh = false) => {
    setState((s) => ({ ...s, [id]: 'loading' }));
    try {
      const p = await load(id, fresh);
      setData((d) => ({ ...d, [id]: p }));
      setState((s) => ({ ...s, [id]: 'ok' }));
    } catch (e) {
      setState((s) => ({ ...s, [id]: String(e.message || e) }));
    }
  }, []);
  const fetchAll = useCallback((fresh = false) => ['world', ...COUNTRIES].forEach((id) => fetchOne(id, fresh)), [fetchOne]);
  // Crédito USD cotiza ~100 bonos: se pide solo al abrir la solapa (y con Recargar si ya estaba abierta).
  useEffect(() => {
    if (['usd', 'sust', 'val', 'news'].includes(tab) && !data[tab] && state[tab] !== 'loading') fetchOne(tab);
    // El ranking de emisores se muestra en Crédito USD: se pide junto con esa solapa.
    if (tab === 'usd' && !data.rank && state.rank !== 'loading') fetchOne('rank');
    // Calendario económico (dato vs consenso): con la Agenda.
    if (tab === 'agenda' && !data.cal && state.cal !== 'loading') fetchOne('cal');
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);
  // Actualización automática con la pestaña visible: precios de Mundo cada minuto; la solapa abierta cada 5 minutos.
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    const visible = () => document.visibilityState === 'visible';
    // Mundo (precios) y Noticias (titulares) cada minuto; el resto de las solapas cada 5 minutos.
    const w = setInterval(() => {
      if (!visible()) return;
      fetchOne('world');
      if (tabRef.current === 'news') fetchOne('news');
      if (tabRef.current === 'agenda') fetchOne('cal'); // el CDN lo guarda 3 min: los datos nuevos entran en ≤3 min
    }, 60_000);
    const t = setInterval(() => {
      const id = tabRef.current;
      if (visible() && !['world', 'news', 'agenda', 'compare'].includes(id)) fetchOne(id);
    }, 300_000);
    return () => { clearInterval(w); clearInterval(t); };
  }, [fetchOne]);
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
    .flatMap((p) => (p.calendar || []).map((e) => ({ ...e, cid: p.id })))
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
          {MAIN_TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
              <Flag id={t.id} /> {t.label}
              {state[t.id] === 'loading' && <span className="dot" />}
            </button>
          ))}
          <CountryMenu items={COUNTRY_TABS} current={tab} onPick={go} loading={COUNTRY_TABS.some((c) => state[c.id] === 'loading')} />
        </nav>
        <div className="actions">
          {updated && (
            <span className="muted upd" title={`Datos generados ${new Date(updated).toLocaleString('es-AR')}`}>
              Act. {new Date(updated).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="btn" onClick={() => { fetchAll(true); ['usd', 'sust', 'val', 'rank', 'news'].forEach((t) => data[t] && fetchOne(t, true)); }}>Recargar</button>
        </div>
      </header>

      <main>
        {tab === 'compare' && <h2 className="title"><Flag id="compare" /> Comparar países</h2>}
        {tab !== 'agenda' && current && (
          <h2 className="title">
            <Flag id={current.id} /> {current.name}
            {current.currency && <span className="muted"> · {current.currency}</span>}
          </h2>
        )}
        {tab === 'compare' ? (
          <ComparePanel countries={countries} a={cmpA} b={cmpB} setA={setCmpA} setB={setCmpB} />
        ) : tab === 'sust' && current ? (
          <SustPanel data={current} />
        ) : tab === 'news' && current ? (
          <NewsPanel data={current} />
        ) : tab === 'val' && current ? (
          <ValPanel data={current} />
        ) : tab === 'usd' && current ? (
          <>
            <RankPanel data={data.rank} state={state.rank} />
            <UsdPanel data={current} />
          </>
        ) : tab === 'agenda' ? (
          <AgendaTabs cal={data.cal} calState={state.cal} agenda={agenda} />
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
