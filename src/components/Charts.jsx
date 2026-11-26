import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, ComposedChart, Scatter, ReferenceArea, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { useId } from 'react';
import { COLORS, fmtNum, fmtDate, fmtMonth } from '../format.js';

function TipBox({ active, payload, label, unit, decimals = 2, labelFmt = fmtDate }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <div className="tip-date">{labelFmt(label)}</div>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <div key={p.dataKey} className="tip-row">
            <span className="swatch" style={{ background: p.color }} />
            <span className="tip-name">{p.name}</span>
            <span className="tip-val">{fmtNum(p.value, decimals)}{unit}</span>
          </div>
        ))}
    </div>
  );
}

/** Serie temporal genérica. Un solo eje Y (nunca dual). */
export function TimeChart({ chart, height = 220 }) {
  const { data, lines, unit = '', title } = chart;
  if (!data?.length) return <div className="empty">Sin datos</div>;
  const decimals = unit === '%' ? 2 : unit === ' pb' ? 0 : data.at(-1)?.[lines[0].key] > 100 ? 0 : 4;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 0 }} aria-label={title}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="d" tickFormatter={fmtMonth} minTickGap={40} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} />
        <YAxis domain={['auto', 'auto']} width={48} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => fmtNum(v, unit === '%' ? 1 : Math.abs(v) >= 100 || Number.isInteger(v) ? 0 : 2)} />
        <Tooltip content={<TipBox unit={unit} decimals={decimals} />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        {lines.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />}
        {lines.map((l, i) => (
          <Line key={l.key} dataKey={l.key} name={l.label} type={l.step ? 'stepAfter' : 'monotone'} stroke={COLORS[i]}
            strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Trayectoria esperada de la tasa (encuesta o mercado) vs tasa actual. */
export function PathChart({ path, current, height = 220 }) {
  const data = path.path.map((p) => ({ d: p.label, v: p.rate }));
  const ref = path.current ?? current;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 0 }} aria-label={path.title}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="d" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} interval="preserveStartEnd"
          minTickGap={8} tickFormatter={(v) => (/^\d{4}-\d{2}$/.test(v) ? fmtMonth(v + '-01') : String(v).replace(/^R(\d)\/20(\d\d)$/, 'R$1·$2'))} />
        <YAxis domain={[(min) => Math.floor(Math.min(min, ref ?? min) * 4 - 1) / 4, (max) => Math.ceil(Math.max(max, ref ?? max) * 4 + 1) / 4]}
          width={48} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v, 2)} />
        <Tooltip content={<TipBox unit="%" decimals={3} labelFmt={(l) => l} />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        {ref != null && (
          <ReferenceLine y={ref} stroke="var(--text-muted)" strokeDasharray="4 4"
            label={{ value: `${path.currentLabel || 'Actual'} ${fmtNum(ref, 2)}%`, fill: 'var(--text-secondary)', fontSize: 11, position: 'insideBottomRight' }} />
        )}
        <Line dataKey="v" name="Tasa esperada" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4, fill: COLORS[0], stroke: 'var(--surface-1)', strokeWidth: 2 }}
          activeDot={{ r: 5 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Spark({ data, height = 36 }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis hide domain={['auto', 'auto']} />
        <Line dataKey="v" stroke={COLORS[0]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Área con degradé para los cuadros de Mundo: verde si el período sube, rojo si baja. Tooltip con fecha y valor. */
export function AreaSpark({ data, up = true, height = 100 }) {
  const gid = useId().replace(/:/g, '');
  if (!data?.length) return null;
  const color = up ? 'var(--mk-pos)' : 'var(--mk-neg)';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['auto', 'auto']} />
        <XAxis dataKey="d" hide />
        <Tooltip content={<TipBox unit="" decimals={2} />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        <Area dataKey="v" name="Valor" stroke={color} strokeWidth={2} fill={`url(#g${gid})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Curvas de rendimiento por plazo: hasta 3 emisores (puntos = bonos, unidos por línea) y la curva del Tesoro
 * como referencia gris punteada. Eje X numérico (años al vencimiento). Un solo eje Y.
 */
export function CurveChart({ series, benchmark, unit = '%', height = 340 }) {
  if (!series?.length) return <div className="empty">Elegí al menos un emisor</div>;
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <div className="empty">Sin bonos con precio reciente</div>;
  const fmtY = (v) => (unit === 'pb' ? fmtNum(v, 0) : fmtNum(v, 1));
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="tip">
        <div className="tip-date">{p.label || 'Tesoro EE.UU.'}</div>
        <div className="tip-row"><span className="swatch" style={{ background: payload[0].color || 'var(--text-muted)' }} /><span className="tip-name">{fmtNum(p.x, 1)} años</span>
          <span className="tip-val">{unit === 'pb' ? `${fmtNum(p.y, 0)} pb` : `${fmtNum(p.y, 2)}%`}</span></div>
        {p.extra && <div className="tip-date" style={{ marginTop: 4, marginBottom: 0 }}>{p.extra}</div>}
      </div>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis type="number" dataKey="x" domain={[0, (max) => Math.ceil(max / 5) * 5]} tickCount={9} allowDecimals={false} name="Años"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false}
          label={{ value: 'años al vencimiento', position: 'insideBottomRight', offset: -4, fill: 'var(--text-muted)', fontSize: 11 }} />
        <YAxis type="number" dataKey="y" domain={['auto', 'auto']} width={48} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false} tickLine={false} tickFormatter={fmtY} />
        <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--text-muted)' }} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
        {benchmark?.length ? (
          <Scatter name="Tesoro EE.UU." data={benchmark} line={{ stroke: 'var(--text-muted)', strokeDasharray: '5 4', strokeWidth: 1.5 }}
            shape={() => null} legendType="plainline" fill="var(--text-muted)" isAnimationActive={false} />
        ) : null}
        {series.map((s, i) => (
          <Scatter key={s.name} name={s.name} data={s.points} fill={COLORS[i]} line={{ stroke: COLORS[i], strokeWidth: 2 }}
            shape={(p) => <circle cx={p.cx} cy={p.cy} r={4.5} fill={COLORS[i]} stroke="var(--surface-1)" strokeWidth={2} />}
            legendType="plainline" isAnimationActive={false} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Serie anual (eje X = año) con la zona de proyección sombreada y línea en 0. Un solo eje Y, hasta 3 series.
 * `data`: [{ y, k1, k2, ... }], `projFrom`: primer año proyectado.
 */
export function YearChart({ data, lines, projFrom, unit = '%', height = 260, zero = true }) {
  if (!data?.length) return <div className="empty">Sin datos</div>;
  const last = data[data.length - 1].y;
  const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="tip">
        <div className="tip-date">{label}{label >= projFrom ? ' · proyección FMI' : ''}</div>
        {payload.filter((p) => p.value != null).map((p) => (
          <div key={p.dataKey} className="tip-row"><span className="swatch" style={{ background: p.color }} /><span className="tip-name">{p.name}</span>
            <span className="tip-val">{fmtNum(p.value, 1)}{unit}</span></div>
        ))}
      </div>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        {projFrom && projFrom <= last && (
          <ReferenceArea x1={projFrom - 0.5} x2={last + 0.5} fill="var(--surface-3)" fillOpacity={0.55} ifOverflow="extendDomain"
            label={{ value: 'Proyección FMI', position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 11 }} />
        )}
        {zero && <ReferenceLine y={0} stroke="var(--text-muted)" strokeOpacity={0.6} />}
        <XAxis dataKey="y" type="number" domain={[data[0].y - 0.5, last + 0.5]} ticks={data.filter((r) => r.y % 2 === 1).map((r) => r.y)}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} allowDecimals={false} />
        <YAxis width={44} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v, 0)} domain={['auto', 'auto']} />
        <Tooltip content={<Tip />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        {lines.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />}
        {lines.map((l, i) => (
          <Line key={l.key} dataKey={l.key} name={l.label} stroke={COLORS[i]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * P/E histórico con bandas de ±1 y ±2 desvíos alrededor del promedio de la ventana. Las bandas son áreas sombreadas
 * (no series): una sola línea de datos, un solo eje Y. Rótulos a la derecha para no depender del color.
 */
export function PeBandChart({ data, stats, height = 300, title }) {
  if (!data?.length) return <div className="empty">Sin datos</div>;
  const vals = data.map((p) => p.pe).filter(Number.isFinite);
  const lo = stats ? Math.min(...vals, stats.avg - 2 * stats.sd) : Math.min(...vals);
  const hi = stats ? Math.max(...vals, stats.avg + 2 * stats.sd) : Math.max(...vals);
  const pad = (hi - lo) * 0.06;
  const band = (y1, y2, op) => <ReferenceArea y1={y1} y2={y2} fill="var(--series-1)" fillOpacity={op} stroke="none" ifOverflow="extendDomain" />;
  const tag = (y, text) => <ReferenceLine y={y} stroke="transparent" label={{ value: text, position: 'right', fill: 'var(--text-muted)', fontSize: 11 }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 64, bottom: 0, left: 0 }} aria-label={title}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        {stats && band(stats.avg - 2 * stats.sd, stats.avg + 2 * stats.sd, 0.08)}
        {stats && band(stats.avg - stats.sd, stats.avg + stats.sd, 0.16)}
        {stats && <ReferenceLine y={stats.avg} stroke="var(--text-muted)" strokeDasharray="4 4" />}
        {stats && tag(stats.avg + 2 * stats.sd, '+2σ')}
        {stats && tag(stats.avg + stats.sd, '+1σ')}
        {stats && tag(stats.avg, 'μ')}
        {stats && tag(stats.avg - stats.sd, '−1σ')}
        {stats && tag(stats.avg - 2 * stats.sd, '−2σ')}
        <XAxis dataKey="d" tickFormatter={fmtMonth} minTickGap={40} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} />
        <YAxis domain={[Math.max(0, lo - pad), hi + pad]} width={40} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v, 0)} />
        <Tooltip content={<TipBox unit="" decimals={2} labelFmt={fmtMonth} />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        <Line type="monotone" dataKey="pe" name="P/E" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Puntaje de fundamentos (eje X, 0–100) contra spread EMBI (eje Y, escala logarítmica) con la curva ajustada.
 * Cada punto lleva el nombre del país (no depende del color). Por encima de la curva: paga más de lo que justifican los fundamentos.
 */
export function ScoreSpreadChart({ points, fit, height = 320 }) {
  if (!points?.length) return <div className="empty">Sin datos</div>;
  const curve = fit ? Array.from({ length: 21 }, (_, i) => ({ score: i * 5, fit: Math.exp(fit.a + fit.b * i * 5) })) : [];
  const ys = [...points.map((p) => p.spread), ...curve.map((c) => c.fit)].filter((v) => v > 0);
  const lo = Math.max(10, Math.min(...ys) * 0.8), hi = Math.max(...ys) * 1.2;
  const Label = ({ cx, cy, payload }) => (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="var(--series-1)" />
      <text x={cx + 8} y={cy + 4} fill="var(--text-secondary)" fontSize={12}>{payload.name}</text>
    </g>
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart margin={{ top: 10, right: 30, bottom: 18, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis type="number" dataKey="score" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          label={{ value: 'Puntaje de fundamentos (100 = mejor del grupo)', position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 11 }} />
        <YAxis type="number" dataKey="spread" scale="log" domain={[lo, hi]} allowDataOverflow width={56} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v) => `${fmtNum(v, 0)}`} label={{ value: 'Spread EMBI (pb)', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
          const p = active && payload?.find((x) => x.payload?.name)?.payload;
          return p ? <div className="tip"><div className="tip-date">{p.name}</div><div className="tip-row">Puntaje {fmtNum(p.score, 0)} · spread {fmtNum(p.spread, 0)} pb</div></div> : null;
        }} />
        {fit && <Line data={curve} dataKey="fit" type="monotone" stroke="var(--text-muted)" strokeDasharray="5 4" dot={false} isAnimationActive={false} name="Spread que justifican los fundamentos" />}
        <Scatter data={points} dataKey="spread" shape={<Label />} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Velas (SVG propio: Recharts no tiene velas) con media y bandas de ±1σ (rayas) y ±2σ (puntos).
 * candles: [{d, o, h, l, c}]. Color de mercado: sube (c ≥ o) verde, baja rojo; la forma (cuerpo lleno/vacío) refuerza el color.
 */
export function CandleChart({ candles, mean, sd, height = 320, fmt = (v) => v.toFixed(3) }) {
  const W = 900, H = height, padL = 8, padR = 64, padT = 10, padB = 24;
  if (!candles?.length) return <div className="empty">Sin datos</div>;
  const lo = Math.min(...candles.map((c) => c.l), mean - 2.2 * sd);
  const hi = Math.max(...candles.map((c) => c.h), mean + 2.2 * sd);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const step = (W - padL - padR) / candles.length;
  const x = (i) => padL + step * (i + 0.5);
  const bw = Math.max(1, Math.min(9, step * 0.65));
  const bands = [[2, 'dot', '+2σ'], [1, 'dash', '+1σ'], [0, 'mean', 'Media'], [-1, 'dash', '−1σ'], [-2, 'dot', '−2σ']];
  // Marcas del eje X: primer dato de cada trimestre (o de cada año si hay muchos).
  const many = candles.length > 120;
  const ticks = candles.map((c, i) => [c, i]).filter(([c], i) => i === 0 || (many ? c.d.slice(0, 4) !== candles[i - 1].d.slice(0, 4)
    : Math.floor((+c.d.slice(5, 7) - 1) / 3) !== Math.floor((+candles[i - 1].d.slice(5, 7) - 1) / 3)));
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return (
    <svg className="candles" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Velas semanales; último cierre ${fmt(candles.at(-1).c)}`}>
      {bands.map(([k, kind, lbl]) => (
        <g key={lbl}>
          <line x1={padL} x2={W - padR} y1={y(mean + k * sd)} y2={y(mean + k * sd)} className={`cd-band cd-${kind}`} />
          <text x={W - padR + 6} y={y(mean + k * sd) + 4} className="cd-lbl">{lbl} {fmt(mean + k * sd)}</text>
        </g>
      ))}
      {candles.map((c, i) => {
        const up = c.c >= c.o;
        return (
          <g key={c.d} className={up ? 'cd-up' : 'cd-dn'}>
            <title>{`Semana del ${c.d}: apertura ${fmt(c.o)} · máx. ${fmt(c.h)} · mín. ${fmt(c.l)} · cierre ${fmt(c.c)}`}</title>
            <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} className="cd-wick" />
            <rect x={x(i) - bw / 2} width={bw} y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} className="cd-body" />
          </g>
        );
      })}
      {ticks.map(([c, i]) => (
        <text key={c.d} x={Math.max(x(i), padL + 18)} y={H - 6} className="cd-tick" textAnchor={x(i) < padL + 18 ? 'start' : 'middle'}>{many ? c.d.slice(0, 4) : `${MES[+c.d.slice(5, 7) - 1]} ${c.d.slice(2, 4)}`}</text>
      ))}
    </svg>
  );
}
