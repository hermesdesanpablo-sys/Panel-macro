import { useState } from 'react';
import { TimeChart, PathChart, Spark, AreaSpark } from './Charts.jsx';
import { fmtNum, fmtDate, daysUntil, kpiByKey, fmtChg, ARROW, DIR_WORD, GROUPS, chgDir } from '../format.js';
import { Flag } from './Flag.jsx';
import { CmdIcon } from './CmdIcon.jsx';

function Source({ source, url }) {
  if (!source) return null;
  return url ? <a className="src" href={url} target="_blank" rel="noreferrer">{source}</a> : <span className="src">{source}</span>;
}

/** Variación con flecha y fondo según dirección; el número queda en tinta primaria. */
export function Chg({ v, unit = 'pb', title }) {
  const dir = chgDir(v, unit);
  if (!dir) return <span className="chg na">—</span>;
  return (
    <span className={`chg ${dir}`} title={title}>
      <span className="arr" aria-hidden="true">{ARROW[dir]}</span>
      {fmtChg(v, unit)}
    </span>
  );
}

/** Variación porcentual (precios) o en pb (tasas), con el mismo chip. */
function PctChg({ v, unit }) {
  if (v == null || !Number.isFinite(v)) return <span className="chg na">—</span>;
  if (unit === 'pb') return <Chg v={v} unit="pb" />;
  return <Chg v={v} unit="%" />;
}

export function Kpi({ k }) {
  const empty = k.value == null;
  return (
    <div className="kpi" id={`kpi-${k.key}`}>
      <div className="kpi-label">{k.label}</div>
      <div className="kpi-value">
        {empty ? 'n/d' : fmtNum(k.value, k.decimals ?? 2)}
        {!empty && k.unit ? <span className="kpi-unit">{k.unit}</span> : null}
      </div>
      {k.spark?.length > 2 && <div className="kpi-spark"><Spark data={k.spark} height={40} /></div>}
      {k.trend && (
        <div className="kpi-chgs">
          {[['m1', '1 mes'], ['m3', '3 meses'], ['m12', '12 meses']].map(([h, l]) => (
            <div className="kpi-chg" key={h}>
              <span className="kpi-chg-h">{l}</span>
              <Chg v={k.trend[h]} unit={k.trendUnit} />
            </div>
          ))}
        </div>
      )}
      <div className="kpi-foot">
        {k.date && <span>Dato al {fmtDate(k.date)}</span>}
        {k.note && <span className="kpi-note">{k.note}</span>}
        <Source source={k.source} url={k.url} />
      </div>
    </div>
  );
}

/** Tabla "cómo se movió cada variable": Δ a 1/3/6/12 meses y tendencia a 3 meses. */
export function Dynamics({ kpis }) {
  const rows = kpis.filter((k) => k.trend);
  if (!rows.length) return null;
  const groups = GROUPS.filter((g) => rows.some((k) => (k.group || 'other') === g.id));
  return (
    <section className="card" id="dynamics">
      <h3>Dinámica: cómo se movió cada variable</h3>
      <div className="tbl-wrap">
        <table className="tbl dyn">
          <thead>
            <tr><th>Variable</th><th>Último</th><th>1 mes</th><th>3 meses</th><th>6 meses</th><th>12 meses</th><th>Tendencia 3m</th><th className="spark-col">13 meses</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={`g-${g.id}`} className="grp"><td colSpan={8}>{g.label}</td></tr>,
              ...rows.filter((k) => k.group === g.id).map((k) => (
                <tr key={`k-${k.key}`}>
                  <td className="name">{k.label}</td>
                  <td className="num"><b>{fmtNum(k.value, k.decimals ?? 2)}{k.unit}</b></td>
                  {['m1', 'm3', 'm6', 'm12'].map((h) => <td key={h} className="num"><Chg v={k.trend[h]} unit={k.trendUnit} /></td>)}
                  <td className="num muted">{k.direction ? DIR_WORD[k.direction] : '—'}</td>
                  <td className="spark-col"><Spark data={k.spark} /></td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="card-foot">
        <span>Tasas e inflación en puntos básicos; niveles (FX, reservas) en %. "Estable" = movimiento a 3 meses menor a 10 pb o 1%. Cada variación se mide desde el último dato disponible de esa serie.</span>
      </div>
    </section>
  );
}

function Card({ id, title, children, source, url, note }) {
  return (
    <section className="card" id={id}>
      <h3>{title}</h3>
      {children}
      {(note || source) && (
        <div className="card-foot">
          {note && <span>{note}</span>}
          <Source source={source} url={url} />
        </div>
      )}
    </section>
  );
}

function PerfTable({ equity }) {
  const rows = [equity?.msci, equity?.local].filter(Boolean);
  return (
    <div className="tbl-wrap"><table className="tbl">
      <thead>
        <tr><th>Índice</th><th>Último</th><th>1 día</th><th>Año</th><th>12 meses</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.ticker}>
            <td className="name">{r.label}</td>
            <td className="num"><b>{fmtNum(r.perf?.last, r.perf?.last > 1000 ? 0 : 2)}</b></td>
            {['d1', 'ytd', 'y1'].map((f) => <td key={f} className="num"><PctChg v={r.perf?.[f]} /></td>)}
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function ExpTable({ e }) {
  return (
    <Card id={`exp-${e.title}`} title={e.title} source={e.source} url={e.url} note={e.asOf ? `Encuesta del ${fmtDate(e.asOf)}` : null}>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr>{e.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {e.rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => <td key={i} className={i ? 'num' : 'name'}>{i ? (c == null ? '—' : fmtNum(c, 2)) : c}</td>)}
            </tr>
          ))}
        </tbody>
      </table></div>
    </Card>
  );
}

export function AgendaList({ events, showFlag = false }) {
  if (!events?.length) return <div className="empty">Sin eventos cargados</div>;
  return (
    <ul className="agenda">
      {events.map((e, i) => {
        const n = daysUntil(e.date);
        return (
          <li key={i} className={e.kind === 'cb' ? 'ev-cb' : 'ev-data'}>
            <span className="ev-date">{fmtDate(e.date)}</span>
            <span className="ev-in">{n <= 0 ? 'hoy' : `${n}d`}</span>
            <span className="ev-tag">{e.kind === 'cb' ? 'Decisión' : 'Dato'}</span>
            <span className="ev-name">
              {showFlag && <Flag id={e.cid} />}
              {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.event}</a> : e.event}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Errors({ errors }) {
  if (!errors?.length) return null;
  return (
    <details className="errors">
      <summary>⚠ {errors.length} fuente{errors.length > 1 ? 's' : ''} no respondieron</summary>
      <ul>{errors.map((e, i) => <li key={i}><b>{e.source}</b>: {e.message}</li>)}</ul>
    </details>
  );
}

export function CountryPanel({ p }) {
  const policy = kpiByKey(p, 'policy');
  const msci = p.equity?.msci;
  const main = p.charts.filter((c) => c.group !== 'exp');
  const exp = p.charts.filter((c) => c.group === 'exp');
  return (
    <div className="panel">
      <Errors errors={p.errors} />
      <div className="kpis">{p.kpis.map((k) => <Kpi key={k.key} k={k} />)}</div>

      <Dynamics kpis={p.kpis} />

      <div className="grid">
        {main.map((c) => (
          <Card key={c.id} id={`chart-${c.id}`} title={c.title}>
            <TimeChart chart={c} />
          </Card>
        ))}
        {p.equity && (
          <Card id="equity" title="Renta variable" source="Yahoo Finance" url={msci ? `https://finance.yahoo.com/quote/${msci.ticker}` : null}
            note="ETF MSCI como proxy del índice MSCI país (en USD)">
            <PerfTable equity={p.equity} />
            {msci && <TimeChart chart={{ title: msci.label, unit: '', lines: [{ key: 'v', label: msci.ticker }], data: msci.series }} height={150} />}
          </Card>
        )}
      </div>

      <h2 className="section" id="expectativas">Expectativas: hoy y cómo se movieron</h2>
      <div className="grid">
        {exp.map((c) => (
          <Card key={c.id} id={`chart-${c.id}`} title={c.title}>
            <TimeChart chart={c} />
          </Card>
        ))}
        {p.path && (
          <Card id="path" title={p.path.title} source={p.path.source} url={p.path.url}
            note={[p.path.asOf && `Al ${fmtDate(p.path.asOf)}`, p.path.note].filter(Boolean).join(' · ')}>
            <PathChart path={p.path} current={policy?.value} />
          </Card>
        )}
        {p.expectations?.map((e) => <ExpTable key={e.title} e={e} />)}
        {!exp.length && !p.path && !p.expectations?.length && (
          <div className="card empty">Sin fuente de expectativas cargada todavía (ver pendientes en CLAUDE.md).</div>
        )}
      </div>

      <h2 className="section">Agenda</h2>
      <section className="card" id="agenda">
        <AgendaList events={p.calendar?.slice(0, 10)} />
      </section>
    </div>
  );
}

/** Tendencias comparadas entre países (variaciones a 3 y 12 meses). */
function TrendsTable({ countries }) {
  const cols = [
    { k: 'cpi', h: 'm3', label: 'Inflación 3m' },
    { k: 'cpi', h: 'm12', label: 'Inflación 12m' },
    { k: 'policy', h: 'm12', label: 'Tasa política 12m' },
    { k: 'exp_rate', h: 'm3', label: 'Expectativa de tasa 3m' },
    { k: 'exp_cpi', h: 'm3', label: 'Inflación esperada 3m' },
    { k: 'y2', h: 'm3', label: 'Bono 2Y 3m' },
    { k: 'fx', h: 'm3', label: 'FX 3m*', fx: true },
  ];
  const cell = (p, c) => {
    const k = kpiByKey(p, c.k);
    let v = k?.trend?.[c.h];
    if (v == null) return <td key={c.label} className="num"><span className="chg na">—</span></td>;
    // FX: expresar como apreciación (+) / depreciación (−) de la moneda local vs USD.
    if (c.fx && !['eu', 'us'].includes(p.id)) v = (1 / (1 + v / 100) - 1) * 100;
    const unit = c.fx ? '%' : k.trendUnit;
    return <td key={c.label} className="num"><Chg v={v} unit={unit} title={k.label} /></td>;
  };
  return (
    <section className="card" id="trends">
      <h3>Tendencias: hacia dónde se mueve cada país</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>País</th>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
          <tbody>
            {countries.map((p) => (
              <tr key={p.id}><td className="name"><span className="cell-flag"><Flag id={p.id} />{p.name}</span></td>{cols.map((c) => cell(p, c))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-foot">
        <span>Expectativa de tasa: Focus (BR), futuros Fed funds (EE.UU.), forward 1Y AAA (EZ), Encuesta Banxico (MX), 2Y − overnight (CA), IBR 6M − política (CO), JGB 2Y − call (JP). Inflación esperada: Focus (BR), breakeven (EE.UU., CA), SPF (EZ), Encuesta Banxico (MX), Tankan (JP). Pasá el mouse sobre una celda para ver la serie usada. * FX: + = la moneda local se apreció vs USD.</span>
      </div>
    </section>
  );
}

const CMP_COLS = [
  { k: 'policy', label: 'Tasa política' },
  { k: 'cpi', label: 'Inflación a/a' },
  { k: 'real', label: 'Tasa real*' },
  { k: 'y2', label: 'Bono 2Y' },
  { k: 'slope', label: '2Y − política*' },
  { k: 'fx', label: 'FX vs USD 1a*' },
  { k: 'msci', label: 'MSCI YTD (USD)' },
  { k: 'next', label: 'Próx. decisión' },
];

/** Tabla comparativa de niveles entre países. */
function CountryCompareTable({ countries }) {
  const rows = countries.map((p) => {
    const pol = kpiByKey(p, 'policy')?.value;
    const cpi = kpiByKey(p, 'cpi')?.value;
    const y2 = kpiByKey(p, 'y2')?.value;
    const fx = kpiByKey(p, 'fx');
    // FX: variación de la moneda local vs USD (positivo = se apreció).
    // EUR/USD y DXY ya cotizan la moneda local en el numerador; el resto (USD/XXX) se invierte.
    let fxChg = fx?.change ?? null;
    if (fxChg != null && !['eu', 'us'].includes(p.id)) fxChg = (1 / (1 + fxChg / 100) - 1) * 100;
    return {
      p,
      policy: pol,
      cpi,
      real: pol != null && cpi != null ? pol - cpi : null,
      y2,
      y2Label: kpiByKey(p, 'y2')?.label,
      slope: pol != null && y2 != null ? (y2 - pol) * 100 : null,
      fx: fxChg,
      msci: p.equity?.msci?.perf?.ytd,
      next: p.calendar?.find((e) => e.kind === 'cb')?.date,
    };
  });
  return (
    <section className="card" id="compare-table">
      <h3>Comparativo por país</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>País</th>{CMP_COLS.map((c) => <th key={c.k}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.id}>
                <td className="name"><span className="cell-flag"><Flag id={r.p.id} />{r.p.name}</span></td>
                <td className="num"><b>{fmtNum(r.policy)}%</b></td>
                <td className="num">{fmtNum(r.cpi)}%</td>
                <td className="num">{fmtNum(r.real)}%</td>
                <td className="num" title={r.y2Label}>{r.y2 == null ? '—' : `${fmtNum(r.y2)}%`}{r.y2Label && <span className="sub">{r.y2Label}</span>}</td>
                <td className="num">{r.slope == null ? '—' : `${r.slope > 0 ? '+' : ''}${fmtNum(r.slope, 0)} pb`}</td>
                <td className="num"><Chg v={r.fx} unit="%" /></td>
                <td className="num"><Chg v={r.msci} unit="%" /></td>
                <td className="num">{r.next ? fmtDate(r.next) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-foot">
        <span>* Cálculos propios: real = tasa − inflación a/a (ex-post); 2Y − política &gt; 0 sugiere que el mercado descuenta subas, &lt; 0 bajas; FX positivo = moneda local se apreció vs USD (EE.UU.: DXY). Bono 2Y: nodo más cercano disponible en cada país (debajo, la serie usada).</span>
      </div>
    </section>
  );
}

// ---------- Mundo: cuadros tipo terminal + panel lateral "hoy" ----------
const decFor = (m) => (m.unit === '%' ? 2 : m.perf?.last > 1000 ? 2 : m.perf?.last < 10 ? 4 : 2);
const sign = (v, d) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = Number(Math.abs(v).toFixed(d));
  return `${r === 0 ? '' : v > 0 ? '+' : '−'}${fmtNum(r, d)}`;
};
/** Clase de color de mercado: verde sube, rojo baja (siempre con signo, nunca color solo). */
const pn = (v) => (v == null || !Number.isFinite(v) || Math.abs(v) < 1e-9 ? 'mk-flat' : v > 0 ? 'mk-pos' : 'mk-neg');
const yahoo = (t) => `https://finance.yahoo.com/quote/${encodeURIComponent(t)}`;

/** Ícono de un activo de Mundo: dibujo para commodities, bandera redonda para el resto. */
function AssetIcon({ m, size = 18 }) {
  return m.cc === 'cmd' ? <CmdIcon ticker={m.ticker} size={size + 2} /> : <Flag id={m.cc} round size={size} />;
}

function Badge({ m }) {
  return <span className="badge-ico"><Flag id={m.cc} round size={34} /></span>;
}

/** Lista de índices principales: ícono, nombre + código, último y variación del día. */
function MajorIndices({ markets }) {
  const [all, setAll] = useState(false);
  const rows = markets.filter((m) => m.featured && m.perf);
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section className="card tv-card" id="major-indices">
      <h3>Índices principales</h3>
      <ul className="idx-list">
        {shown.map((m) => (
          <li key={m.ticker}>
            <a href={yahoo(m.ticker)} target="_blank" rel="noreferrer" className="idx-row">
              <Badge m={m} />
              <span className="idx-name">
                <span className="idx-label">{m.label}</span>
                <span className="tick">{m.code}</span>
              </span>
              <span className="idx-vals">
                <span className="idx-last">{fmtNum(m.perf.last, 2)}</span>
                <span className={`idx-chg ${pn(m.perf.d1)}`}>{sign(m.perf.d1, 2)}%</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {rows.length > 6 && (
        <button className="link-btn" onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver los ${rows.length} índices`} ›</button>
      )}
    </section>
  );
}

/** Cuadro con número grande y mini gráfico de área (estilo "market cap"). */
function QuoteCard({ m, title }) {
  if (!m?.perf) return null;
  const up = (m.perf.y1 ?? 0) >= 0;
  return (
    <section className="card tv-card quote-card">
      <h3 className="qc-head"><Badge m={m} /><span>{title || m.label}</span><span className="tick">{m.code}</span></h3>
      <div className="qc-last">{fmtNum(m.perf.last, decFor(m))}{m.unit === '%' ? '%' : ''}</div>
      <div className="qc-chgs">
        <span className={pn(m.perf.d1)}>{sign(m.perf.d1, 2)}{m.perf.chgUnit === 'pb' ? ' pb' : '%'} <span className="muted">hoy</span></span>
        <span className={pn(m.perf.ytd)}>{sign(m.perf.ytd, m.perf.chgUnit === 'pb' ? 0 : 1)}{m.perf.chgUnit === 'pb' ? ' pb' : '%'} <span className="muted">en el año</span></span>
      </div>
      <AreaSpark data={m.spark} up={up} height={110} />
      <div className="card-foot"><span>12 meses · Yahoo Finance</span></div>
    </section>
  );
}

/** Cuadros de bonos a 10 años (o el plazo largo disponible) de cada país del monitor. */
function BondTiles({ countries, markets }) {
  const tiles = countries
    .map((p) => {
      const k = kpiByKey(p, 'y10');
      if (!k?.value) return null;
      const daily = k.prevDate && (Date.parse(k.date) - Date.parse(k.prevDate)) / 864e5 <= 5;
      return { id: p.id, name: p.name, label: k.label, v: k.value, chg: daily ? k.prevChange : k.trend?.m1, per: daily ? '1 día' : '1 mes' };
    })
    .filter(Boolean);
  const us30 = markets.find((m) => m.ticker === '^TYX');
  return (
    <section className="card tv-card" id="bonds">
      <h3>Bonos a 10 años en moneda local</h3>
      <div className="bond-tiles">
        {tiles.map((t) => (
          <div key={t.id} className={`bond-tile ${t.chg > 0.5 ? 'bt-pos' : t.chg < -0.5 ? 'bt-neg' : 'bt-flat'}`} title={t.label}>
            <span className="bt-head"><Flag id={t.id} round size={20} />{t.name}</span>
            <span className="bt-val">{fmtNum(t.v, 2)}%</span>
            <span className="bt-chg">{sign(t.chg, 0)} pb <span className="bt-per">{t.per}</span></span>
          </div>
        ))}
        {us30?.perf && (
          <div className={`bond-tile ${us30.perf.d1 > 0.5 ? 'bt-pos' : us30.perf.d1 < -0.5 ? 'bt-neg' : 'bt-flat'}`}>
            <span className="bt-head"><Flag id="us" round size={20} />EE.UU. 30Y</span>
            <span className="bt-val">{fmtNum(us30.perf.last, 2)}%</span>
            <span className="bt-chg">{sign(us30.perf.d1, 0)} pb <span className="bt-per">1 día</span></span>
          </div>
        )}
      </div>
      <div className="card-foot"><span>Costo de financiamiento en moneda propia de cada país (no es deuda en dólares). Verde: la tasa subió · rojo: bajó. Eurozona: curva AAA; Brasil: NTN-F interpolada; México: última subasta; Colombia: promedio mensual.</span></div>
    </section>
  );
}

/** Cuadritos chicos para un grupo (commodities, riesgo). */
function MiniTiles({ title, items }) {
  return (
    <section className="card tv-card">
      <h3>{title}</h3>
      <div className="mini-tiles">
        {items.filter((m) => m.perf).map((m) => (
          <a key={m.ticker} className="mini-tile" href={yahoo(m.ticker)} target="_blank" rel="noreferrer">
            <span className="mt-name">{m.cc === 'cmd' && <CmdIcon ticker={m.ticker} size={20} />}{m.label}</span>
            <span className="mt-last">{fmtNum(m.perf.last, decFor(m))}</span>
            <span className={`mt-chg ${pn(m.perf.d1)}`}>{m.perf.chgUnit === 'pb' ? `${sign(m.perf.d1, 0)} pb` : `${sign(m.perf.d1, 2)}%`}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

/** Panel lateral: cómo vienen hoy todos los activos (Último, Var, Var %). */
function Watchlist({ markets }) {
  const groups = [...new Set(markets.map((m) => m.group))];
  return (
    <aside className="watch" aria-label="Mercados hoy">
      <div className="watch-head"><span>Hoy</span><span className="muted">variación del día</span></div>
      <table className="watch-tbl">
        <thead><tr><th>Símbolo</th><th>Último</th><th>Var</th><th>Var %</th></tr></thead>
        <tbody>
          {groups.map((g) => [
            <tr key={`g-${g}`} className="wgrp"><td colSpan={4}>{g}</td></tr>,
            ...markets.filter((m) => m.group === g).map((m) => {
              const p = m.perf;
              const isRate = p?.chgUnit === 'pb';
              return (
                <tr key={m.ticker} title={m.label} onClick={() => window.open(yahoo(m.ticker), '_blank', 'noopener')}>
                  <td><span className="w-sym"><AssetIcon m={m} size={16} />{m.code}</span></td>
                  <td className="num">{p ? fmtNum(p.last, decFor(m)) : '—'}</td>
                  <td className={`num ${pn(p?.d1abs)}`}>{p ? sign(p.d1abs, isRate ? 3 : decFor(m)) : '—'}</td>
                  <td className={`num ${pn(p?.d1)}`}>{p ? (isRate ? `${sign(p.d1, 0)} pb` : `${sign(p.d1, 2)}%`) : '—'}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </aside>
  );
}

export function WorldPanel({ world, countries }) {
  const markets = world?.markets || [];
  const by = (t) => markets.find((m) => m.ticker === t);
  const perfGroups = [...new Set(markets.map((m) => m.group))];
  return (
    <div className="panel">
      <Errors errors={world?.errors} />
      <div className="world-layout">
        <div className="world-main">
          <div className="tv-grid">
            <MajorIndices markets={markets} />
            <div className="tv-col">
              <QuoteCard m={by('ACWI')} title="MSCI ACWI (mundo, USD)" />
              <QuoteCard m={by('DX-Y.NYB')} title="Índice dólar" />
            </div>
          </div>
          <div className="tv-grid">
            <BondTiles countries={countries} markets={markets} />
            <div className="tv-col">
              <MiniTiles title="Commodities" items={markets.filter((m) => m.group === 'Commodities')} />
              <MiniTiles title="Riesgo y tasas EE.UU." items={[by('^VIX'), by('^IRX'), by('^TNX')].filter(Boolean)} />
            </div>
          </div>
          {world?.charts?.filter((c) => c.id === 'regions').map((c) => (
            <Card key={c.id} id={`chart-${c.id}`} title={c.title} source="Yahoo Finance" url={yahoo('ACWI')}>
              <TimeChart chart={c} height={260} />
            </Card>
          ))}
          <TrendsTable countries={countries} />
          <CountryCompareTable countries={countries} />
          <h2 className="section">Desempeño por grupo</h2>
          <div className="grid">
            {perfGroups.map((g) => (
              <section className="card" key={g} id={`mk-${g}`}>
                <h3>{g}</h3>
                <div className="tbl-wrap"><table className="tbl mk-tbl">
                  <thead><tr><th>Activo</th><th>Último</th><th>Año</th><th>12 meses</th><th className="spark-col">12 meses</th></tr></thead>
                  <tbody>
                    {markets.filter((m) => m.group === g).map((m) => (
                      <tr key={m.ticker}>
                        <td className="name"><a href={yahoo(m.ticker)} target="_blank" rel="noreferrer" className="cell-flag"><AssetIcon m={m} size={18} />{m.label}</a></td>
                        <td className="num"><b>{m.perf ? `${fmtNum(m.perf.last, decFor(m))}${m.unit === '%' ? '%' : ''}` : '—'}</b></td>
                        {['ytd', 'y1'].map((f) => <td key={f} className="num"><PctChg v={m.perf?.[f]} unit={m.perf?.chgUnit} /></td>)}
                        <td className="spark-col"><Spark data={m.spark} height={30} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            ))}
          </div>
        </div>
        <Watchlist markets={markets} />
      </div>
    </div>
  );
}

// ---------- Comparar dos países ----------
const CMP_ROWS = [
  { k: 'policy', label: 'Tasa de política' },
  { k: 'cpi', label: 'Inflación a/a' },
  { k: 'exp_cpi', label: 'Inflación esperada' },
  { k: 'exp_rate', label: 'Expectativa de tasa' },
  { k: 'y2', label: 'Bono ~2 años' },
  { k: 'y10', label: 'Bono 10 años' },
  { k: 'fx', label: 'Tipo de cambio' },
];

/** Une dos series [{d,v}] en filas {d, a, b} ordenadas por fecha (huecos se conectan en el gráfico). */
function joinAB(a = [], b = []) {
  const m = new Map();
  for (const p of a) m.set(p.d, { d: p.d, a: p.v });
  for (const p of b) m.set(p.d, { ...(m.get(p.d) || { d: p.d }), b: p.v });
  return [...m.values()].sort((x, y) => (x.d < y.d ? -1 : 1));
}
/** Base 100 en la primera observación. `invert`: para USD/XXX, así sube = la moneda local se aprecia. */
function base100(s = [], invert = false) {
  if (!s.length) return [];
  const v0 = s[0].v;
  return s.map((p) => ({ d: p.d, v: invert ? (v0 / p.v) * 100 : (p.v / v0) * 100 }));
}

function CountrySelect({ value, onChange, countries, other }) {
  return (
    <label className="cmp-select">
      <Flag id={value} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Elegir país">
        {countries.map((p) => <option key={p.id} value={p.id} disabled={p.id === other}>{p.name}</option>)}
      </select>
    </label>
  );
}

export function ComparePanel({ countries, a, b, setA, setB }) {
  const A = countries.find((p) => p.id === a);
  const B = countries.find((p) => p.id === b);
  if (!A || !B) return <div className="empty big">Cargando países…</div>;
  const kA = (k) => kpiByKey(A, k);
  const kB = (k) => kpiByKey(B, k);
  const fxInvert = (p) => !['eu', 'us'].includes(p.id);
  const lines = [{ key: 'a', label: A.name }, { key: 'b', label: B.name }];
  const charts = [
    { id: 'policy', title: 'Tasa de política', unit: '%', step: true },
    { id: 'cpi', title: 'Inflación a/a', unit: '%' },
    { id: 'y2', title: 'Bono ~2 años', unit: '%' },
    { id: 'y10', title: 'Bono 10 años', unit: '%' },
  ].map((c) => ({ ...c, lines: lines.map((l) => ({ ...l, step: c.step })), data: joinAB(kA(c.id)?.spark, kB(c.id)?.spark) }));
  charts.push({
    id: 'fx', title: 'Moneda local vs USD (base 100; sube = se aprecia)', unit: '', lines,
    data: joinAB(base100(kA('fx')?.spark, fxInvert(A)), base100(kB('fx')?.spark, fxInvert(B))),
  });
  charts.push({
    id: 'msci', title: 'MSCI país en USD (base 100)', unit: '', lines,
    data: joinAB(base100(A.equity?.msci?.series), base100(B.equity?.msci?.series)),
  });
  const nextCb = (p) => p.calendar?.find((e) => e.kind === 'cb');
  return (
    <div className="panel">
      <div className="cmp-pick">
        <CountrySelect value={a} onChange={setA} countries={countries} other={b} />
        <button className="btn swap" onClick={() => { setA(b); setB(a); }} aria-label="Intercambiar países">⇄</button>
        <CountrySelect value={b} onChange={setB} countries={countries} other={a} />
      </div>

      <section className="card" id="cmp-table">
        <h3>Lado a lado</h3>
        <div className="tbl-wrap">
          <table className="tbl cmp-tbl">
            <thead>
              <tr>
                <th>Variable</th>
                <th><span className="th-flag"><Flag id={A.id} />{A.name}</span></th><th>3 meses</th><th>12 meses</th>
                <th><span className="th-flag"><Flag id={B.id} />{B.name}</span></th><th>3 meses</th><th>12 meses</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {CMP_ROWS.map((r) => {
                const x = kA(r.k), y = kB(r.k);
                const pct = x?.unit === '%' && y?.unit === '%' && x.value != null && y.value != null;
                const diff = pct ? (x.value - y.value) * 100 : null;
                const cell = (k) => (k?.value == null ? <td className="num">—</td> : (
                  <td className="num"><b>{fmtNum(k.value, k.decimals ?? 2)}{k.unit}</b><span className="sub">{k.label}</span></td>
                ));
                return (
                  <tr key={r.k}>
                    <td className="name">{r.label}</td>
                    {cell(x)}
                    <td className="num"><Chg v={x?.trend?.m3} unit={x?.trendUnit} /></td>
                    <td className="num"><Chg v={x?.trend?.m12} unit={x?.trendUnit} /></td>
                    {cell(y)}
                    <td className="num"><Chg v={y?.trend?.m3} unit={y?.trendUnit} /></td>
                    <td className="num"><Chg v={y?.trend?.m12} unit={y?.trendUnit} /></td>
                    <td className="num">{diff == null ? '—' : <b>{`${diff > 0 ? '+' : ''}${fmtNum(diff, 0)} pb`}</b>}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="name">MSCI país (USD), en el año</td>
                <td className="num" colSpan={3}><Chg v={A.equity?.msci?.perf?.ytd} unit="%" /></td>
                <td className="num" colSpan={3}><Chg v={B.equity?.msci?.perf?.ytd} unit="%" /></td>
                <td className="num">{A.equity?.msci?.perf?.ytd != null && B.equity?.msci?.perf?.ytd != null ? <b>{fmtChg(A.equity.msci.perf.ytd - B.equity.msci.perf.ytd, '%').replace('%', ' pp')}</b> : '—'}</td>
              </tr>
              <tr>
                <td className="name">Próxima decisión</td>
                <td className="num" colSpan={3}>{nextCb(A) ? fmtDate(nextCb(A).date) : '—'}</td>
                <td className="num" colSpan={3}>{nextCb(B) ? fmtDate(nextCb(B).date) : '—'}</td>
                <td className="num" />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card-foot"><span>Diferencia = {A.name} − {B.name}, en puntos básicos (solo tasas). Debajo de cada valor, la serie que usa cada país: no siempre son el mismo instrumento (ver nota en cada panel).</span></div>
      </section>

      <div className="grid">
        {charts.map((c) => (
          <Card key={c.id} id={`cmp-${c.id}`} title={c.title}>
            <TimeChart chart={c} />
          </Card>
        ))}
      </div>
    </div>
  );
}
