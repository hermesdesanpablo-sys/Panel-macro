import { useState } from 'react';
import { TimeChart, PathChart, Spark, AreaSpark, CurveChart, YearChart } from './Charts.jsx';
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
    <Card id={`exp-${e.title}`} title={e.title} source={e.source} url={e.url} note={e.asOf ? `${e.asOfLabel || 'Encuesta del'} ${fmtDate(e.asOf)}` : null}>
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

const EV_TAG = { cb: 'Decisión', data: 'Dato', pol: 'Político' };
const EV_CLASS = { cb: 'ev-cb', data: 'ev-data', pol: 'ev-pol' };

export function AgendaList({ events, showFlag = false }) {
  if (!events?.length) return <div className="empty">Sin eventos cargados</div>;
  return (
    <ul className="agenda">
      {events.map((e, i) => {
        const n = daysUntil(e.date);
        return (
          <li key={i} className={EV_CLASS[e.kind] || 'ev-data'}>
            <span className="ev-date">{fmtDate(e.date)}</span>
            <span className="ev-in">{n <= 0 ? 'hoy' : `${n}d`}</span>
            <span className="ev-tag">{EV_TAG[e.kind] || 'Dato'}</span>
            <span className="ev-name">
              {showFlag && <Flag id={e.flag || e.cid} />}
              {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.event}</a> : e.event}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const AGENDA_FILTERS = [
  ['all', 'Todo'],
  ['eco', 'Económico'],
  ['pol', 'Político'],
];
/** Agenda consolidada con filtro: todo, económico (decisiones de banco central y datos) o solo político. */
export function AgendaPanel({ events, undated = [] }) {
  const [f, setF] = useState(() => { try { return localStorage.getItem('agendaFilter') || 'all'; } catch { return 'all'; } });
  const pick = (v) => { setF(v); try { localStorage.setItem('agendaFilter', v); } catch { /* sin almacenamiento */ } };
  const shown = events.filter((e) => f === 'all' || (f === 'pol' ? e.kind === 'pol' : e.kind !== 'pol'));
  const count = (k) => events.filter((e) => k === 'all' || (k === 'pol' ? e.kind === 'pol' : e.kind !== 'pol')).length;
  return (
    <>
      <div className="agenda-bar">
        <div className="seg" role="group" aria-label="Filtrar agenda">
          {AGENDA_FILTERS.map(([k, label]) => (
            <button key={k} className={f === k ? 'on' : ''} aria-pressed={f === k} onClick={() => pick(k)}>
              {label} <span className="muted">{count(k)}</span>
            </button>
          ))}
        </div>
      </div>
      <AgendaList events={shown} showFlag />
      {f !== 'eco' && undated.length > 0 && (
        <div className="agenda-undated">
          <h4>Sin fecha confirmada</h4>
          <ul>{undated.map((e, i) => <li key={i}><Flag id={e.cid} /> {e.event}</li>)}</ul>
        </div>
      )}
    </>
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
        <span>Expectativa de tasa: TAMAR esperada REM (AR), Focus (BR), futuros Fed funds (EE.UU.), forward 1Y AAA (EZ), Encuesta Banxico (MX), 2Y − overnight (CA), IBR 6M − política (CO), JGB 2Y − call (JP). Inflación esperada: REM (AR), Focus (BR), breakeven (EE.UU., CA), SPF (EZ), Encuesta Banxico (MX), Tankan (JP). Pasá el mouse sobre una celda para ver la serie usada. * FX: + = la moneda local se apreció vs USD.</span>
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
    // EURUSD y DXY ya cotizan la moneda local en el numerador; el resto (USD/XXX) se invierte.
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
      <div className="card-foot"><span>Costo de financiamiento en moneda propia de cada país (no es deuda en dólares: ver la solapa Crédito USD). Verde: la tasa subió · rojo: bajó. Eurozona: curva AAA; Brasil: NTN-F interpolada; México: última subasta; Colombia: promedio mensual.</span></div>
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
      <div className="watch-foot">Monedas en formato de mercado: USDMXN = pesos mexicanos por 1 dólar; EURUSD = dólares por 1 euro.</div>
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


// ---------- Crédito soberano en USD ----------
const RANGES = { '1A': 365, '3A': 3 * 365, '5A': 5 * 365, Todo: 1e6 };

/** Spread EMBI por país (BCRD): ranking con variaciones y rango 12m, más historia comparada. */
function EmbiSection({ embi }) {
  const [sel, setSel] = useState(['ar', 'br', 'cl']);
  const [range, setRange] = useState('3A');
  const [sortKey, setSortKey] = useState('last');
  if (!embi) return <div className="card empty">El spread EMBI del BCRD no respondió; probá Recargar.</div>;
  const aggs = embi.countries.filter((c) => ['global', 'latam'].includes(c.id));
  const ctry = embi.countries.filter((c) => !['global', 'latam'].includes(c.id));
  const outlier = (c) => c.last > 2000; // Venezuela en default: fuera de la escala de barras
  const maxBar = Math.max(1, ...ctry.filter((c) => !outlier(c)).map((c) => c.last));
  const sortVal = (c) => (sortKey === 'last' ? c.last : c.chg[sortKey] ?? -1e9);
  // Los países en default (fuera de escala) van siempre al final.
  const ranked = [...ctry].sort((a, b) => (outlier(a) - outlier(b)) || sortVal(b) - sortVal(a));
  const toggle = (id) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? [...cur.slice(1), id] : [...cur, id]));
  const from = new Date(Date.parse(embi.asOf) - RANGES[range] * 864e5).toISOString().slice(0, 10);
  const idx = embi.dates.map((d, i) => [d, i]).filter(([d]) => d >= from);
  const latam = embi.countries.find((c) => c.id === 'latam');
  const chosen = sel.map((id) => embi.countries.find((c) => c.id === id)).filter(Boolean);
  const chart = {
    title: 'Spread EMBI', unit: ' pb',
    lines: chosen.map((c, i) => ({ key: `k${i}`, label: c.name })),
    data: idx.map(([d, i]) => Object.fromEntries([['d', d], ...chosen.map((c, k) => [`k${k}`, c.values[i]])])),
  };
  const chgCell = (v) => <td className="num"><Chg v={v} unit="pb" /></td>;
  const ust7 = embi.ust7;
  return (
    <>
      <section className="card" id="embi-rank">
        <div className="card-head">
          <h3>Riesgo país: spread EMBI por país</h3>
          <div className="seg" role="group" aria-label="Ordenar por">
            {[['last', 'Spread'], ['m1', '1 mes'], ['y1', '12 meses'], ['ytd', 'En el año']].map(([k, l]) => (
              <button key={k} className={sortKey === k ? 'on' : ''} onClick={() => setSortKey(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="embi-aggs">
          {aggs.map((c) => (
            <div key={c.id} className="mini-tile">
              <span className="mt-name">{c.name}</span>
              <span className="mt-last">{fmtNum(c.last, 0)} pb</span>
              <span className="muted" style={{ fontSize: 12.5 }}><Chg v={c.chg.m1} unit="pb" /> 1 mes</span>
            </div>
          ))}
          {ust7 != null && (
            <div className="mini-tile">
              <span className="mt-name">Tesoro EE.UU. 7 años</span>
              <span className="mt-last">{fmtNum(ust7, 2)}%</span>
              <span className="muted" style={{ fontSize: 12.5 }}>base para el rendimiento implícito</span>
            </div>
          )}
        </div>
        <div className="tbl-wrap">
          <table className="tbl usd-rank">
            <thead>
              <tr><th>País</th><th>Spread</th><th className="bar-col">Nivel</th><th>1 día</th><th>1 mes</th><th>3 meses</th><th>12 meses</th><th>En el año</th><th>Rango 12 meses</th><th>Rend. USD aprox.</th></tr>
            </thead>
            <tbody>
              {ranked.map((c) => {
                const pos = c.max1y > c.min1y ? ((c.last - c.min1y) / (c.max1y - c.min1y)) * 100 : 50;
                return (
                  <tr key={c.id} className={sel.includes(c.id) ? 'sel' : ''} onClick={() => toggle(c.id)} style={{ cursor: 'pointer' }} title="Clic para sumarlo o quitarlo del gráfico">
                    <td className="name"><span className="cell-flag"><Flag id={c.cc} />{c.name}</span>{c.stale && <span className="sub">dato al {fmtDate(c.date)}</span>}</td>
                    <td className="num"><b>{fmtNum(c.last, 0)} pb</b></td>
                    <td className="bar-col">{outlier(c) ? <span className="muted" style={{ fontSize: 12 }}>fuera de escala (default)</span> : <span className="hbar" style={{ width: `${Math.max(2, (c.last / maxBar) * 100)}%` }} />}</td>
                    {chgCell(c.chg.d1)}{chgCell(c.chg.m1)}{chgCell(c.chg.m3)}{chgCell(c.chg.y1)}{chgCell(c.chg.ytd)}
                    <td className="num range-cell">
                      <span className="range"><span className="range-dot" style={{ left: `${pos}%` }} /></span>
                      <span className="sub">{fmtNum(c.min1y, 0)} – {fmtNum(c.max1y, 0)}</span>
                    </td>
                    <td className="num">{ust7 != null && !outlier(c) ? `${fmtNum(ust7 + c.last / 100, 2)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card-foot">
          <span>Spread del índice J.P. Morgan EMBI Global Diversified de cada país contra Treasuries, en pb, al {fmtDate(embi.asOf)}. Fuente: <a className="src" href={embi.url} target="_blank" rel="noreferrer">Banco Central de la República Dominicana</a> (planilla diaria). Rojo = el spread subió (más riesgo). Rango 12 meses: el punto marca dónde está hoy entre el mínimo y el máximo del año. Rend. USD aprox. = Treasury 7 años + spread (la duration típica del índice); es una referencia, no la TIR de un bono puntual. Hacé clic en un país para sumarlo al gráfico.</span>
        </div>
      </section>

      <section className="card" id="embi-hist">
        <div className="card-head">
          <h3>Historia del spread EMBI</h3>
          <div className="seg" role="group" aria-label="Período">
            {Object.keys(RANGES).map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}
          </div>
        </div>
        <div className="chips" role="group" aria-label="Países (hasta 3)">
          {[latam, ...ranked].filter(Boolean).map((c) => (
            <button key={c.id} className={`chip ${sel.includes(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)} aria-pressed={sel.includes(c.id)}>
              <Flag id={c.cc} round size={16} />{c.name}
            </button>
          ))}
        </div>
        {chosen.length ? <TimeChart chart={chart} height={300} /> : <div className="empty">Elegí hasta 3 países</div>}
        <div className="card-foot"><span>En pb. Hasta 3 países a la vez. Serie diaria los últimos 60 días, semanal hasta 5 años y mensual antes.</span></div>
      </section>
    </>
  );
}

const SORTS = { s10: 'Spread 10Y', sMean: 'Spread promedio', y10: 'Rendimiento 10Y' };

export function UsdPanel({ data }) {
  const issuers = data?.issuers || [];
  const withData = issuers.filter((i) => i.summary.n > 0);
  const [sel, setSel] = useState(['br', 'mx', 'co']);
  const [mode, setMode] = useState('ytm');
  const [detail, setDetail] = useState('br');
  const [sortKey, setSortKey] = useState('s10');
  const ranked = [...issuers].sort((a, b) => (b.summary[sortKey] ?? -1e9) - (a.summary[sortKey] ?? -1e9));
  const maxSpread = Math.max(1, ...issuers.map((i) => i.summary.s10 ?? i.summary.sMean ?? 0));
  const toggle = (id) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? [...cur.slice(1), id] : [...cur, id]));
  const series = sel
    .map((id) => issuers.find((i) => i.id === id))
    .filter(Boolean)
    .map((i) => ({
      name: i.name,
      points: i.bonds.filter((b) => !b.stale && b.years <= 40 && (mode === 'ytm' ? b.ytm != null : b.spread != null)).map((b) => ({
        x: b.years, y: mode === 'ytm' ? b.ytm : b.spread, label: `${i.name} ${fmtNum(b.coupon, 3)}% ${b.maturity.slice(0, 4)}`,
        extra: `Precio ${fmtNum(b.price, 2)} al ${fmtDate(b.priceDate)}`,
      })),
    }));
  const ref = mode === 'ytm' ? (data?.ust || []).map((p) => ({ x: p.years, y: p.v })) : [];
  const det = issuers.find((i) => i.id === detail);
  const cell = (v, unit, d = 2) => (v == null ? <span className="muted">—</span> : unit === 'pb' ? `${fmtNum(v, 0)} pb` : `${fmtNum(v, d)}%`);
  if (!issuers.length) return <div className="empty big">Sin datos de bonos</div>;
  return (
    <div className="panel">
      <Errors errors={data?.errors} />
      <p className="lead">
        Lo que el mercado le cobra a cada país por financiarse <b>en dólares</b>: el spread EMBI (riesgo país) y, debajo, las curvas
        armadas con los bonos soberanos en USD de cada emisor. No confundir con los bonos en moneda local.
      </p>
      <EmbiSection embi={data?.embi} />
      <h2 className="section">Curvas por bono (precios indicativos)</h2>

      <section className="card" id="usd-rank">
        <div className="card-head">
          <h3>Ranking de emisores</h3>
          <div className="seg" role="group" aria-label="Ordenar por">
            {Object.entries(SORTS).map(([k, l]) => <button key={k} className={sortKey === k ? 'on' : ''} onClick={() => setSortKey(k)}>{l}</button>)}
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl usd-rank">
            <thead>
              <tr><th>Emisor</th><th>Bonos</th><th>Rend. 5Y</th><th>Rend. 10Y</th><th>Spread 5Y</th><th>Spread 10Y</th><th className="bar-col">Spread 10Y vs UST</th><th>Spread prom.</th><th>Plazo máx.</th></tr>
            </thead>
            <tbody>
              {ranked.map((i) => {
                const sp = i.summary.s10 ?? i.summary.sMean;
                return (
                  <tr key={i.id} className={detail === i.id ? 'sel' : ''} onClick={() => setDetail(i.id)} style={{ cursor: 'pointer' }}>
                    <td className="name"><span className="cell-flag"><Flag id={i.cc} />{i.name}</span></td>
                    <td className="num">{i.summary.n}<span className="muted">/{i.summary.total}</span></td>
                    <td className="num">{cell(i.summary.y5)}</td>
                    <td className="num"><b>{cell(i.summary.y10)}</b></td>
                    <td className="num">{cell(i.summary.s5, 'pb')}</td>
                    <td className="num"><b>{cell(i.summary.s10, 'pb')}</b></td>
                    <td className="bar-col">{sp != null && <span className="hbar" style={{ width: `${Math.max(2, (sp / maxSpread) * 100)}%` }} />}</td>
                    <td className="num">{cell(i.summary.sMean, 'pb')}</td>
                    <td className="num">{i.summary.maxYears ? `${fmtNum(i.summary.maxYears, 0)} años` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card-foot">
          <span>Rendimiento y spread a 5 y 10 años: interpolados entre los bonos del emisor (sin extrapolar; "—" si no hay bonos a ambos lados del plazo). Spread = rendimiento − Tesoro de EE.UU. al mismo plazo. La barra usa el spread 10Y (o el promedio si no hay). Hacé clic en un emisor para ver sus bonos.</span>
        </div>
      </section>

      <section className="card" id="usd-curves">
        <div className="card-head">
          <h3>Curvas en USD por plazo</h3>
          <div className="seg" role="group" aria-label="Medida">
            <button className={mode === 'ytm' ? 'on' : ''} onClick={() => setMode('ytm')}>Rendimiento</button>
            <button className={mode === 'spread' ? 'on' : ''} onClick={() => setMode('spread')}>Spread vs UST</button>
          </div>
        </div>
        <div className="chips" role="group" aria-label="Emisores (hasta 3)">
          {withData.map((i) => (
            <button key={i.id} className={`chip ${sel.includes(i.id) ? 'on' : ''}`} onClick={() => toggle(i.id)} aria-pressed={sel.includes(i.id)}>
              <Flag id={i.cc} round size={16} />{i.name}
            </button>
          ))}
        </div>
        <CurveChart series={series} benchmark={ref} unit={mode === 'ytm' ? '%' : 'pb'} />
        <div className="card-foot"><span>Hasta 3 emisores a la vez (para que los colores se distingan). Cada punto es un bono con precio de los últimos días; la línea gris punteada es la curva del Tesoro (FRED). Se grafica hasta 40 años: los bonos más largos (México 2110, Perú 2121) están en la tabla.</span></div>
      </section>

      {det && (
        <section className="card" id="usd-bonds">
          <div className="card-head">
            <h3 className="cell-flag"><Flag id={det.cc} />Bonos en USD de {det.name}</h3>
            <select className="sel-sm" value={detail} onChange={(e) => setDetail(e.target.value)} aria-label="Emisor">
              {issuers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Bono</th><th>Cupón</th><th>Vencimiento</th><th>Precio</th><th>Rendimiento</th><th>Duration</th><th>Spread vs UST</th><th>Precio al</th></tr></thead>
              <tbody>
                {det.bonds.map((b) => (
                  <tr key={b.isin} className={b.stale ? 'stale' : ''}>
                    <td className="name"><a href={b.url} target="_blank" rel="noreferrer">{b.isin}</a><span className="sub">{b.name}</span></td>
                    <td className="num">{fmtNum(b.coupon, 3)}%{b.couponType && b.couponType !== 'Fest' ? <span className="sub">step-up / variable</span> : null}</td>
                    <td className="num">{fmtDate(b.maturity)}<span className="sub">{fmtNum(b.years, 1)} años</span></td>
                    <td className="num">{b.price == null ? '—' : fmtNum(b.price, 2)}</td>
                    <td className="num"><b>{cell(b.ytm)}</b>{b.amort && <span className="sub">amortizable / step-up</span>}</td>
                    <td className="num">{b.dur == null ? '—' : fmtNum(b.dur, 1)}</td>
                    <td className="num">{cell(b.spread, 'pb')}</td>
                    <td className="num">{b.priceDate ? fmtDate(b.priceDate) : '—'}{b.stale && <span className="sub">fuera de la curva</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-foot">
            <span>Precios limpios indicativos de bolsas alemanas (onvista). Rendimiento en base semestral (como los Treasuries): bonos bullet, cálculo propio desde el precio; amortizables y step-up (Argentina, Ecuador y algunos de Panamá y Uruguay), TIR de onvista pasada de anual a semestral (contrastar con la fuente local). Duration modificada en años. Los bonos con precio de más de 10 días, en default o sin cupón informado quedan fuera de las curvas (en gris). Lista de bonos al {data.listUpdated ? fmtDate(data.listUpdated) : '—'}.</span>
          </div>
        </section>
      )}
    </div>
  );
}


// ---------- Sostenibilidad: tres brechas y deuda/PBI ----------
const pct = (v, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${fmtNum(v, d)}%`);
const lvl = (v, d = 1) => (v == null ? '—' : `${fmtNum(v, d)}%`);
/** Celda con signo y color de "holgura": verde si es favorable, rojo si no (siempre con signo). */
// `invert`: para variables donde subir es desfavorable (p.ej. la deuda).
const Signed = ({ v, d = 1, unit = '%', invert = false }) => {
  if (v == null) return <span className="muted">—</span>;
  const good = invert ? v < -0.05 : v > 0.05, bad = invert ? v > 0.05 : v < -0.05;
  return <span className={good ? 'mk-pos' : bad ? 'mk-neg' : ''}>{v > 0 ? '+' : ''}{fmtNum(v, d)}{unit}</span>;
};
const HIGH_INFL = ['ar']; // la fórmula en moneda local no captura el efecto cambiario sobre deuda en USD

const offDate = (x) => (x ? fmtDate(x.d) : '');
/** Lectura en texto de la ficha de un país (solo con los números que hay; nada inventado). */
function reading(c) {
  const s = c.summary;
  const o = c.official;
  const out = [];
  if (o && (o.pb || o.fb || o.debt)) {
    const parts = [];
    if (o.pb) parts.push(`resultado primario ${pct(o.pb.v)} del PBI`);
    if (o.fb) parts.push(`resultado total ${pct(o.fb.v)}`);
    const per = (o.pb || o.fb) ? ` (${(o.pb || o.fb).label}, al ${offDate(o.pb || o.fb)})` : '';
    out.push(`Dato oficial más reciente: ${parts.join(' y ')}${per}.` + (o.debt ? ` Deuda: ${lvl(o.debt.v, 1)} del PBI (${o.debt.label}, al ${offDate(o.debt)}).` : '') +
      ' Lo que sigue usa el FMI (gobierno general, anual) para que los países sean comparables.');
  }
  if (s.ca != null && s.fb != null) {
    out.push(`En ${s.year}, ${c.name} tuvo ${s.ca < 0 ? 'un déficit' : 'un superávit'} de cuenta corriente de ${fmtNum(Math.abs(s.ca), 1)}% del PBI: ` +
      `el sector público ${s.fb < 0 ? 'desahorró' : 'ahorró'} ${fmtNum(Math.abs(s.fb), 1)}% (resultado del gobierno general según el FMI, con intereses devengados) y el sector privado ${s.priv >= 0 ? 'ahorró' : 'desahorró'} en neto ${fmtNum(Math.abs(s.priv), 1)}%.` +
      (s.ca < 0 ? ' Esa brecha externa se financia con ahorro del resto del mundo (deuda, inversión extranjera o caída de reservas).' : ' El país es acreedor neto del resto del mundo en ese año.'));
  }
  if (s.trade != null && s.tradeYear === s.year && s.ca != null) {
    out.push(`La balanza comercial de bienes y servicios fue ${pct(s.trade)} del PBI; la diferencia con la cuenta corriente (${pct(s.ca - s.trade)}) son rentas (intereses y utilidades) y transferencias.`);
  }
  if (s.debt != null && s.debt2y != null) {
    out.push(`La deuda pública bruta (gobierno general) ${s.debtChg2y > 0 ? 'subió' : 'bajó'} ${fmtNum(Math.abs(s.debtChg2y), 0)} puntos del PBI en los últimos dos años: ` +
      `${lvl(s.debt2y, 0)} en ${s.year - 2}, ${lvl(s.debt1y, 0)} en ${s.year - 1} y ${lvl(s.debt, 0)} en ${s.year}.` +
      (s.debtEnd != null ? ` El FMI la proyecta en ${lvl(s.debtEnd, 0)} para ${s.endYear}.` : '') +
      (c.id === 'ar' ? ' Ojo con 2023: la deuda a fin de año, ya devaluada en diciembre, se mide contra un PBI a precios promedio del año; por eso el ratio salta y parte de la baja posterior es ese mismo efecto de valuación.' : ''));
  }
  if (s.pbStar != null && s.pb != null) {
    out.push(`En ${s.year} la deuda pagó una tasa implícita de ${lvl(s.iEff)} y el PBI nominal creció ${lvl(s.gNom)} (${lvl(s.growth)} real` +
      (s.cpiEop != null ? `; inflación ${lvl(s.cpiEop)} diciembre contra diciembre` : '') + `): con eso, el resultado primario que estabiliza la deuda es ${pct(s.pbStar)}; ` +
      `el efectivo fue ${pct(s.pb)} (${s.pbGap >= 0 ? 'holgura' : 'faltante'} de ${fmtNum(Math.abs(s.pbGap), 1)} puntos).` +
      (s.pbStarProj != null ? ` Con las proyecciones del FMI para ${s.year + 1}–${s.endYear}, el primario que estabiliza promedia ${pct(s.pbStarProj)} y el proyectado ${pct(s.pbProj)}.` : '') +
      (HIGH_INFL.includes(c.id) ? ' Ojo: la fórmula en moneda local no incluye el efecto del tipo de cambio sobre la deuda en dólares; en un año de desinflación, el crecimiento nominal del año (promedio) licúa más de lo que va a licuar hacia adelante.' : ''));
  }
  return out;
}

export function SustPanel({ data }) {
  const countries = data?.countries || [];
  const [sel, setSel] = useState('br');
  const [debtSel, setDebtSel] = useState(['ar', 'br', 'mx']);
  if (!countries.length) return <div className="empty big">Sin datos del FMI</div>;
  const c = countries.find((x) => x.id === sel) || countries[0];
  const P = data.projFrom;
  const rows = c.rows;
  const toggle = (id) => setDebtSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? [...cur.slice(1), id] : [...cur, id]));
  const debtData = rows.map((r) => Object.fromEntries([['y', r.y], ...debtSel.map((id, k) => [`k${k}`, countries.find((x) => x.id === id)?.rows.find((q) => q.y === r.y)?.debt ?? null])]));
  const Y = countries[0].summary.year, E = countries[0].summary.endYear;
  return (
    <div className="panel">
      <Errors errors={data?.errors} />
      <p className="lead">
        Modelo de las <b>tres brechas</b>: la cuenta corriente (brecha externa) es igual al resultado fiscal más el ahorro neto del sector privado
        (S − I). Junto con la trayectoria de la deuda pública y el resultado primario que la estabiliza, muestra de dónde sale la capacidad de repago
        de cada país. Datos anuales en % del PBI; {P} en adelante, estimación y proyección del FMI (WEO{data.weoVintage ? ` actualizado al ${data.weoVintage}` : ''}).
      </p>

      <section className="card" id="sust-table">
        <h3>Tablero ({Y}, deuda a {E})</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>País</th><th>Cuenta corriente</th><th>Resultado fiscal</th><th>Primario</th><th>Brecha privada (S−I)</th>
                <th>Deuda/PBI {Y - 2}</th><th>{Y - 1}</th><th>{Y}</th><th>Δ 2 años</th><th>Deuda/PBI {E}</th><th>Inflación {Y} (dic/dic)</th><th>Tasa implícita</th><th>Crec. PBI nominal</th><th>Primario que estabiliza</th><th>Holgura</th>
                <th>Balanza comercial</th><th>Reservas (meses imp.)</th>
                <th className="off-col">Oficial: deuda</th><th className="off-col">Oficial: primario</th><th className="off-col">Oficial: total</th>
              </tr>
            </thead>
            <tbody>
              {countries.map((x) => {
                const s = x.summary;
                return (
                  <tr key={x.id} className={x.id === sel ? 'sel' : ''} onClick={() => setSel(x.id)} style={{ cursor: 'pointer' }} title="Clic para ver la ficha">
                    <td className="name"><span className="cell-flag"><Flag id={x.cc} />{x.name}</span></td>
                    <td className="num"><Signed v={s.ca} /></td>
                    <td className="num"><Signed v={s.fb} /></td>
                    <td className="num"><Signed v={s.pb} /></td>
                    <td className="num"><Signed v={s.priv} /></td>
                    <td className="num">{lvl(s.debt2y, 0)}</td>
                    <td className="num">{lvl(s.debt1y, 0)}</td>
                    <td className="num"><b>{lvl(s.debt, 0)}</b></td>
                    <td className="num"><b><Signed v={s.debtChg2y} d={0} unit=" pts" invert /></b></td>
                    <td className="num">{lvl(s.debtEnd, 0)}{s.debtChg != null && <span className="sub"><Signed v={s.debtChg} d={0} unit=" pts" invert /></span>}</td>
                    <td className="num">{lvl(s.cpiEop)}{s.cpiEopNext != null && <span className="sub">{Y + 1}: {lvl(s.cpiEopNext)}</span>}</td>
                    <td className="num">{lvl(s.iEff)}</td>
                    <td className="num">{lvl(s.gNom)}{s.growth != null && <span className="sub">real {lvl(s.growth)}</span>}</td>
                    <td className="num">{pct(s.pbStar)}{s.pbStarProj != null && <span className="sub">prom. {String(Y + 1).slice(2)}–{String(E).slice(2)}: {pct(s.pbStarProj)}</span>}</td>
                    <td className="num"><Signed v={s.pbGap} />{HIGH_INFL.includes(x.id) && s.pbGap != null && <span className="sub">ver nota</span>}</td>
                    <td className="num"><Signed v={s.trade} />{s.tradeYear && s.tradeYear !== Y && <span className="sub">{s.tradeYear}</span>}</td>
                    <td className="num">{s.resMonths == null ? '—' : fmtNum(s.resMonths, 1)}</td>
                    {['debt', 'pb', 'fb'].map((k) => {
                      const o = x.official?.[k];
                      return (
                        <td key={k} className="num off-col" title={o?.label}>
                          {o ? (k === 'debt' ? <b>{lvl(o.v, 1)}</b> : <Signed v={o.v} d={2} />) : <span className="muted">—</span>}
                          {o && <span className="sub">{fmtDate(o.d)} · {o.freq}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card-foot">
          <span>Cuenta corriente = resultado fiscal + brecha privada (identidad de las tres brechas). Resultado fiscal y primario: gobierno general.
            Deuda: gobierno general según el FMI (incluye provincias y estados); puede diferir de la deuda de la Administración Central que publican
            los ministerios (perímetro y PBI usado). Inflación: FMI, diciembre contra diciembre (debajo, la proyección del año siguiente).
            Crec. PBI nominal = crecimiento real + deflactor del PBI, promedio del año (no es la inflación).
            Columnas "Oficial": último dato de cada país con su perímetro y frecuencia (pasá el mouse para ver la fuente): Argentina, Sector Público Nacional
            base caja mensual (acumulado 12 meses; PBI interpolado del FMI); Brasil, DBGG y NFSP del BCB (mensual); Chile, Gobierno Central del BCCh
            (trimestral, 4 trimestres); EE.UU., gobierno federal (FRED); Eurozona, gobierno general (Eurostat, 4 trimestres). El resto, solo FMI.
            Tasa implícita = intereses netos / deuda del año anterior. Primario que estabiliza = d·(i − g)/(1 + g); holgura = primario efectivo − el que estabiliza
            (verde: la deuda tiende a bajar sin esfuerzo adicional). Argentina: con inflación alta y deuda mayormente en dólares, la fórmula en pesos no incluye el efecto
            cambiario y sobrestima la holgura. Canadá: intereses netos negativos (activos de los fondos públicos). Eurozona: el FMI no publica PBI nominal del agregado.
            Fuentes: <a className="src" href={data.sources?.weo} target="_blank" rel="noreferrer">FMI WEO</a> y <a className="src" href={data.sources?.wb} target="_blank" rel="noreferrer">Banco Mundial (WDI)</a>.</span>
        </div>
      </section>

      <h2 className="section">Ficha por país</h2>
      <div className="chips" role="group" aria-label="País">
        {countries.map((x) => (
          <button key={x.id} className={`chip ${x.id === sel ? 'on' : ''}`} onClick={() => setSel(x.id)} aria-pressed={x.id === sel}>
            <Flag id={x.cc} round size={16} />{x.name}
          </button>
        ))}
      </div>
      <section className="card reading">
        <h3 className="cell-flag"><Flag id={c.cc} />{c.name}: lectura</h3>
        {reading(c).map((t, i) => <p key={i}>{t}</p>)}
        <div className="kpis mini-kpis">
          {[['Deuda externa', c.summary.extDebt, '% del ingreso nacional'], ['Servicio de deuda externa', c.summary.extService, '% de las exportaciones'], ['Reservas', c.summary.resMonths, 'meses de importaciones', 1]].map(([l, v, u, plain]) => (
            <div key={l} className="mini-tile"><span className="mt-name">{l}</span><span className="mt-last">{v == null ? '—' : plain ? fmtNum(v, 1) : `${fmtNum(v, 1)}%`}</span><span className="muted" style={{ fontSize: 12 }}>{u} · Banco Mundial</span></div>
          ))}
        </div>
      </section>
      <div className="grid">
        <Card id="gaps" title="Las tres brechas (% del PBI)" note="Cuenta corriente = resultado fiscal + brecha privada.">
          <YearChart data={rows} projFrom={P} lines={[{ key: 'ca', label: 'Cuenta corriente' }, { key: 'fb', label: 'Resultado fiscal' }, { key: 'priv', label: 'Brecha privada (S−I)' }]} />
        </Card>
        <Card id="si" title="Ahorro e inversión nacional (% del PBI)" note="Su diferencia es la cuenta corriente.">
          <YearChart data={rows} projFrom={P} zero={false} lines={[{ key: 'sav', label: 'Ahorro nacional' }, { key: 'inv', label: 'Inversión' }]} />
        </Card>
        <Card id="pbstar" title="Primario efectivo vs el que estabiliza la deuda (% del PBI)" note={HIGH_INFL.includes(c.id) ? 'Con inflación alta, el primario que estabiliza en moneda local es engañoso (ver nota del tablero).' : 'Si el efectivo está por encima, la deuda/PBI tiende a bajar.'}>
          <YearChart data={rows} projFrom={P} lines={[{ key: 'pb', label: 'Primario efectivo' }, { key: 'pbStar', label: 'Primario que estabiliza' }]} />
        </Card>
        {c.official?.series && (c.official.series.pb?.length || c.official.series.fb?.length) ? (
          <Card id="off-fiscal" title={`Resultado fiscal oficial (% del PBI, ${c.official.pb?.freq || c.official.fb?.freq})`} note={(c.official.pb || c.official.fb).label}
            source="Fuente oficial" url={c.official.url}>
            <TimeChart chart={{ title: 'Resultado fiscal oficial', unit: '%', lines: [c.official.series.pb?.length && { key: 'pb', label: 'Primario' }, c.official.series.fb?.length && { key: 'fb', label: 'Total' }].filter(Boolean),
              data: (() => { const m = new Map(); for (const [k, ser] of Object.entries({ pb: c.official.series.pb || [], fb: c.official.series.fb || [] })) for (const p of ser) m.set(p.d, { ...(m.get(p.d) || { d: p.d }), [k]: p.v }); return [...m.values()].sort((a, b) => (a.d < b.d ? -1 : 1)); })() }} />
          </Card>
        ) : null}
        {c.official?.series?.debt?.length ? (
          <Card id="off-debt" title={`Deuda oficial (% del PBI, ${c.official.debt.freq})`} note={c.official.debt.label} source="Fuente oficial" url={c.official.url}>
            <TimeChart chart={{ title: 'Deuda oficial', unit: '%', lines: [{ key: 'v', label: 'Deuda / PBI' }], data: c.official.series.debt.map((p) => ({ d: p.d, v: p.v })) }} />
          </Card>
        ) : null}
        <Card id="trade" title="Balanza comercial vs cuenta corriente (% del PBI)" note="La diferencia son rentas (intereses, utilidades) y transferencias. Balanza comercial: Banco Mundial, sin proyecciones.">
          <YearChart data={rows} projFrom={P} lines={[{ key: 'trade', label: 'Balanza comercial (bienes y servicios)' }, { key: 'ca', label: 'Cuenta corriente' }]} />
        </Card>
      </div>

      <h2 className="section">Trayectoria de la deuda pública / PBI</h2>
      <section className="card" id="debt-path">
        <div className="chips" role="group" aria-label="Países (hasta 3)">
          {countries.map((x) => (
            <button key={x.id} className={`chip ${debtSel.includes(x.id) ? 'on' : ''}`} onClick={() => toggle(x.id)} aria-pressed={debtSel.includes(x.id)}>
              <Flag id={x.cc} round size={16} />{x.name}
            </button>
          ))}
        </div>
        <YearChart data={debtData} projFrom={P} zero={false} height={320}
          lines={debtSel.map((id, k) => ({ key: `k${k}`, label: countries.find((x) => x.id === id)?.name || id }))} />
        <div className="card-foot"><span>Deuda bruta del gobierno general, % del PBI. Hasta 3 países a la vez. Zona sombreada: proyección del FMI.</span></div>
      </section>
    </div>
  );
}

// ---------- Valuación y flujos (ETF iShares por país) ----------
const VAL_NAMES = { br: 'Brasil', us: 'EE.UU.', eu: 'Eurozona', mx: 'México', ca: 'Canadá', cl: 'Chile', pe: 'Perú', jp: 'Japón', in: 'India', latam: 'América Latina', em: 'Emergentes', world: 'Mundo (ACWI)', ar: 'Argentina', co: 'Colombia' };
const VAL_WIN = [['w1', '1 sem'], ['m1', '1 mes'], ['m3', '3 meses'], ['ytd', 'En el año'], ['y1', '12 meses']];
const valFlag = (cid) => (['latam', 'em', 'world'].includes(cid) ? 'world' : cid);

const LECTURA = { Cheap: 'Muy barato', Undervalued: 'Barato', Fair: 'Neutral', Overvalued: 'Caro', Expensive: 'Muy caro' };
const lecturaOf = (z) => (z == null || !Number.isFinite(z) ? null : z < -2 ? 'Cheap' : z < -1 ? 'Undervalued' : z <= 1 ? 'Fair' : z <= 2 ? 'Overvalued' : 'Expensive');
const VAL_WINDOWS = [['y5', '5 años', 5], ['y10', '10 años', 10], ['y20', '20 años', 20]];
const isoDate = (d) => d.toISOString().slice(0, 10);

export function ValPanel({ data }) {
  const rows = data?.rows || data?.funds || [];
  const funds = rows.filter((f) => f.ticker);
  const [unit, setUnit] = useState('usd');
  const [win, setWin] = useState('y10');
  const [peSel, setPeSel] = useState('br');
  const [sel, setSel] = useState(['br', 'mx', 'in']);
  if (!rows.length) return <div className="empty big">Sin datos de valuación</div>;
  const toggle = (id) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? [...cur.slice(1), id] : [...cur, id]));
  const [, winLabel, winYears] = VAL_WINDOWS.find((w) => w[0] === win);

  // Flujo acumulado 12 meses (hasta 3 países).
  const chosen = sel.map((id) => funds.find((f) => f.cid === id)).filter((f) => f?.cum?.length);
  const byDate = new Map();
  chosen.forEach((f, k) => f.cum.forEach((p) => { const r = byDate.get(p.d) || { d: p.d }; r[`k${k}`] = p.v; byDate.set(p.d, r); }));
  const flowChart = {
    title: 'Flujo acumulado 12 meses (USD millones)', unit: '',
    lines: chosen.map((f, k) => ({ key: `k${k}`, label: `${VAL_NAMES[f.cid]} (${f.ticker})` })),
    data: [...byDate.values()].sort((a, b) => (a.d < b.d ? -1 : 1)),
  };

  // P/E histórico del país elegido con la banda μ ± σ de la ventana.
  const peRow = rows.find((r) => r.cid === peSel && r.wpe?.history?.length) || rows.find((r) => r.wpe?.history?.length);
  const st = peRow?.wpe?.stats?.[win];
  const from = peRow ? isoDate(new Date(Date.UTC(Number(peRow.wpe.date.slice(0, 4)) - winYears, Number(peRow.wpe.date.slice(5, 7)) - 1, 1))) : '';
  const peChart = peRow && {
    title: `P/E de ${VAL_NAMES[peRow.cid]}`, unit: '',
    lines: [{ key: 'pe', label: 'P/E' }, ...(st ? [{ key: 'hi', label: 'μ + σ' }, { key: 'lo', label: 'μ − σ' }] : [])],
    data: [...peRow.wpe.history.filter((p) => p.d >= from), { d: peRow.wpe.date, v: peRow.wpe.pe }]
      .map((p) => ({ d: p.d, pe: p.v, ...(st && { hi: st.avg + st.sd, lo: st.avg - st.sd }) })),
  };

  const asOf = funds.find((f) => f.asOf)?.asOf;
  const wpeDate = rows.find((r) => r.wpe?.date)?.wpe.date;
  const msciDate = rows.find((r) => r.msci?.asOf)?.msci.asOf;
  const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : fmtNum(v, d));
  const flowCell = (f, k) => {
    const v = unit === 'usd' ? f.flows?.[k] : f.pct?.[k];
    if (v == null) return <td key={k} className="num"><span className="chg na">—</span></td>;
    return <td key={k} className={`num ${pn(v)}`}>{sign(v, unit === 'usd' ? 0 : 1)}{unit === 'pct' ? '%' : ''}</td>;
  };
  const group = (list, render, cols) => [false, true].map((agg) => (
    <tbody key={String(agg)}>
      {agg && <tr className="tbl-sub"><td colSpan={cols}>Referencias regionales</td></tr>}
      {list.filter((r) => !!r.agg === agg).map(render)}
    </tbody>
  ));
  const countryCell = (r) => <td><span className="cell-flag"><Flag id={valFlag(r.cid)} /> {VAL_NAMES[r.cid]}</span></td>;

  return (
    <div className="panel">
      <Errors errors={data?.errors} />
      <p className="lead">
        Valuación de la bolsa de cada país contra su propia historia y flujos de inversores del exterior. El <b>P/E</b> diario y su historia
        son de worldperatio (calculados sobre el ETF del país); el promedio <b>μ</b> y el desvío <b>σ</b> excluyen el 10% de valores extremos de cada
        lado. "Desvío" = cuántos σ está el P/E actual del promedio. El <b>P/E forward</b> es el del índice MSCI a fin de mes.
      </p>

      <section className="card" id="val-table">
        <div className="card-head">
          <h3>Valuación contra la historia</h3>
          <div className="seg" role="group" aria-label="Ventana histórica">
            {VAL_WINDOWS.map(([k, l]) => <button key={k} className={win === k ? 'on' : ''} aria-pressed={win === k} onClick={() => setWin(k)}>{l}</button>)}
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>País</th><th>ETF</th><th className="num">P/E</th><th className="num">Promedio {winLabel}</th><th className="num">Desvío est.</th>
                <th className="num">Rango ±1 desvío</th><th className="num">Hoy vs promedio</th><th>Lectura</th>
                <th className="num off-col">P/E fwd MSCI</th><th className="num">P/E MSCI</th><th className="num">P/BV</th><th className="num">Div. %</th>
              </tr>
            </thead>
            {group(rows, (r) => {
              const S = r.wpe?.stats?.[win];
              const lec = lecturaOf(S?.z);
              return (
                <tr key={r.cid}>
                  {countryCell(r)}
                  <td>{r.wpe ? <a href={r.wpe.url} target="_blank" rel="noreferrer" title={r.wpe.note || undefined}>{r.wpe.etf}{r.wpe.note ? ' *' : ''}</a> : '—'}</td>
                  <td className="num"><b>{num(r.wpe?.pe)}</b></td>
                  <td className="num">{num(S?.avg)}</td>
                  <td className="num">{num(S?.sd, 2)}</td>
                  <td className="num">{S ? `${fmtNum(S.avg - S.sd, 1)} – ${fmtNum(S.avg + S.sd, 1)}` : '—'}</td>
                  <td className="num">{S?.z == null ? '—' : `${sign(S.z, 2)} σ`}</td>
                  <td>{lec ? <span className={`val-tag val-${lec.toLowerCase()}`}>{LECTURA[lec]}</span> : '—'}</td>
                  <td className="num off-col"><b>{num(r.msci?.peFwd)}</b></td>
                  <td className="num">{num(r.msci?.pe)}</td>
                  <td className="num">{num(r.msci?.pbv, 2)}</td>
                  <td className="num">{num(r.msci?.dy)}</td>
                </tr>
              );
            }, 12)}
          </table>
        </div>
        <div className="card-foot">
          <span>
            P/E y estadísticas al {fmtDate(wpeDate)} (worldperatio); MSCI al {fmtDate(msciDate)} (factsheet mensual). Lectura: dentro de μ ± σ neutral;
            ±1 a 2 σ barato/caro; más de 2 σ muy barato/muy caro. * Eurozona: worldperatio publica Europa (VGK). El P/E de worldperatio
            (sobre el ETF) y el de MSCI (sobre el índice) difieren por método y fecha.
          </span>
          <span>
            <Source source="worldperatio.com" url="https://worldperatio.com/area/" /> · <Source source="MSCI factsheets" url="https://www.msci.com/indexes" />
          </span>
        </div>
      </section>

      {peChart && (
        <section className="card" id="val-pe">
          <div className="card-head">
            <h3>P/E histórico y banda μ ± σ ({winLabel})</h3>
          </div>
          <div className="chips" role="group" aria-label="País">
            {rows.filter((r) => r.wpe?.history?.length).map((r) => (
              <button key={r.cid} className={`chip ${peRow.cid === r.cid ? 'on' : ''}`} aria-pressed={peRow.cid === r.cid} onClick={() => setPeSel(r.cid)}>
                <Flag id={valFlag(r.cid)} /> {VAL_NAMES[r.cid]}
              </button>
            ))}
          </div>
          <TimeChart chart={peChart} height={280} />
          <div className="card-foot">
            <span>
              Mensual; último punto al {fmtDate(peRow.wpe.date)}.{st ? ` μ = ${fmtNum(st.avg, 1)}, σ = ${fmtNum(st.sd, 2)}; hoy ${sign(st.z, 2)} σ.` : ''}
              {peRow.wpe.note ? ` ${peRow.wpe.note}.` : ''}
            </span>
            <Source source={`worldperatio (${peRow.wpe.etf})`} url={peRow.wpe.url} />
          </div>
        </section>
      )}

      <section className="card" id="val-flows">
        <div className="card-head">
          <h3>Flujos de inversores (ETF iShares)</h3>
          <div className="seg" role="group" aria-label="Unidad de los flujos">
            <button className={unit === 'usd' ? 'on' : ''} aria-pressed={unit === 'usd'} onClick={() => setUnit('usd')}>USD millones</button>
            <button className={unit === 'pct' ? 'on' : ''} aria-pressed={unit === 'pct'} onClick={() => setUnit('pct')}>% de los activos</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>País</th><th>ETF</th><th className="num">P/E ETF</th><th className="num">P/B ETF</th><th className="num">Activos (USD M)</th>
                {VAL_WIN.map(([k, l]) => <th key={k} className="num">Flujo {l}</th>)}
              </tr>
            </thead>
            {group([...funds, ...(data.pending || []).map((p) => ({ ...p, pendingRow: true }))], (f) => f.pendingRow ? (
              <tr key={f.ticker} className="row-pending">
                {countryCell(f)}<td>{f.ticker}</td><td colSpan={3 + VAL_WIN.length} className="muted">Pendiente: {f.note}</td>
              </tr>
            ) : (
              <tr key={f.ticker}>
                {countryCell(f)}
                <td><a href={f.url} target="_blank" rel="noreferrer">{f.ticker}</a></td>
                <td className="num">{num(f.pe)}</td>
                <td className="num">{num(f.pb, 2)}</td>
                <td className="num">{f.aum == null ? '—' : fmtNum(f.aum, 0)}</td>
                {VAL_WIN.map(([k]) => flowCell(f, k))}
              </tr>
            ), 5 + VAL_WIN.length)}
          </table>
        </div>
        <div className="chips" role="group" aria-label="Países (hasta 3)">
          {funds.filter((f) => f.cum?.length).map((f) => (
            <button key={f.ticker} className={`chip ${sel.includes(f.cid) ? 'on' : ''}`} aria-pressed={sel.includes(f.cid)} onClick={() => toggle(f.cid)}>
              <Flag id={valFlag(f.cid)} /> {VAL_NAMES[f.cid]}
            </button>
          ))}
        </div>
        <TimeChart chart={flowChart} height={260} />
        <div className="card-foot">
          <span>Flujo = variación diaria de cuotas en circulación × valor cuotaparte. Al {fmtDate(asOf)}. Gráfico: USD millones acumulados en 12 meses (hasta 3 países).</span>
          <Source source="iShares (BlackRock)" url="https://www.ishares.com/us/products/etf-investments" />
        </div>
      </section>
    </div>
  );
}
