import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
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
  const decimals = unit === '%' ? 2 : data.at(-1)?.[lines[0].key] > 100 ? 0 : 4;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 0 }} aria-label={title}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="d" tickFormatter={fmtMonth} minTickGap={40} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} />
        <YAxis domain={['auto', 'auto']} width={48} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => fmtNum(v, unit === '%' ? 1 : v > 100 ? 0 : 2)} />
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
