import { TimeChart, PathChart, Spark } from './Charts.jsx';
import { fmtNum, fmtDate, daysUntil, kpiByKey, fmtChg, ARROW, DIR_WORD, GROUPS, chgDir } from '../format.js';
import { Flag } from './Flag.jsx';

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

export function WorldPanel({ world, countries }) {
  const rows = countries.map((p) => {
    const pol = kpiByKey(p, 'policy')?.value;
    const cpi = kpiByKey(p, 'cpi')?.value;
    const y2 = kpiByKey(p, 'y2')?.value;
    const fx = kpiByKey(p, 'fx');
    // FX: variación de la moneda local vs USD (positivo = se apreció).
    // EUR/USD y DXY ya cotizan la moneda local en el numerador; USD/BRL, USD/MXN, USD/CAD se invierten.
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
  const groups = [...new Set((world?.markets || []).map((m) => m.group))];
  return (
    <div className="panel">
      <Errors errors={world?.errors} />
      <TrendsTable countries={countries} />
      <section className="card" id="compare">
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

      <div className="grid">
        {world?.charts?.map((c) => (
          <Card key={c.id} id={`chart-${c.id}`} title={c.title} source="Yahoo Finance" url="https://finance.yahoo.com/quote/ACWI">
            <TimeChart chart={c} height={260} />
          </Card>
        ))}
      </div>
      <h2 className="section">Mercados</h2>
      <div className="grid">
        {groups.map((g) => (
          <section className="card" key={g} id={`mk-${g}`}>
            <h3>{g}</h3>
            <div className="tbl-wrap"><table className="tbl mk-tbl">
              <thead><tr><th>Activo</th><th>Último</th><th>1 día</th><th>Año</th><th>12 meses</th><th className="spark-col">12 meses</th></tr></thead>
              <tbody>
                {world.markets.filter((m) => m.group === g).map((m) => (
                  <tr key={m.ticker}>
                    <td className="name"><a href={`https://finance.yahoo.com/quote/${encodeURIComponent(m.ticker)}`} target="_blank" rel="noreferrer">{m.label}</a></td>
                    <td className="num"><b>{m.perf ? `${fmtNum(m.perf.last, m.unit === '%' ? 2 : m.perf.last > 1000 ? 0 : m.perf.last < 10 ? 4 : 2)}${m.unit === '%' ? '%' : ''}` : '—'}</b></td>
                    {['d1', 'ytd', 'y1'].map((f) => <td key={f} className="num"><PctChg v={m.perf?.[f]} unit={m.perf?.chgUnit} /></td>)}
                    <td className="spark-col"><Spark data={m.spark} height={30} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        ))}
      </div>
    </div>
  );
}
