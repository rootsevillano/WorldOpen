import { useMemo, useRef, useState } from 'react';

export interface Series {
  name: string;
  /** Token de color de la serie (slot categórico fijo, nunca por rango). */
  color: string;
  values: number[];
}

const W = 340;
const H = 120;
const PAD = { l: 34, r: 8, t: 8, b: 18 };
/** Margen derecho para las etiquetas directas. */
const LABEL_GUTTER = 40;

/**
 * Gráfica de líneas del visor de estudio: una escala Y por gráfica (nunca doble eje), líneas de 2 px, rejilla
 * recesiva, cursor del replay, cruz con tooltip al pasar y clic para saltar a ese momento.
 */
export function LineChart(props: {
  title: string;
  ticks: number[];
  series: Series[];
  cursorTick: number;
  markers: number[];
  ticksPerDay: number;
  /** Ticks desde la medianoche del día 0 hasta el tick 0. */
  startOffset: number;
  format: (v: number) => string;
  /** Rango Y fijo (p. ej. 0–1 para proporciones); si falta, se ajusta a los datos. */
  domain?: [number, number];
  onSeek: (tick: number) => void;
}) {
  const { ticks, series, ticksPerDay } = props;
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const t0 = ticks[0] ?? 0;
  const t1 = Math.max(ticks.at(-1) ?? 1, t0 + 1);
  const [y0, y1] = useMemo(() => {
    if (props.domain) return props.domain;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) for (const v of s.values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) return [0, 1];
    if (lo === hi) return [lo - 1, hi + 1];
    const pad = (hi - lo) * 0.08;
    return [Math.min(lo, 0) === 0 && lo >= 0 ? 0 : lo - pad, hi + pad];
  }, [series, props.domain]);

  // Con 2–4 series las etiquetas directas van en su propio margen, fuera del área de datos.
  const direct = series.length >= 2 && series.length <= 4;
  const right = PAD.r + (direct ? LABEL_GUTTER : 0);
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - right);
  const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const tickAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return t0 + ((px - PAD.l) / (W - PAD.l - right)) * (t1 - t0);
  };
  const nearest = (t: number) => {
    let best = 0;
    for (let k = 1; k < ticks.length; k++) if (Math.abs(ticks[k]! - t) < Math.abs(ticks[best]! - t)) best = k;
    return best;
  };

  // Etiquetas directas a la altura del último valor de cada línea, separadas y dentro del área.
  const endLabels = useMemo(() => {
    if (!direct || ticks.length === 0) return [];
    const top = PAD.t + 6;
    const bottom = H - PAD.b;
    const items = series.map((s) => ({ name: s.name, color: s.color, y: Math.min(bottom, Math.max(top, y(s.values.at(-1) ?? y0) + 3)) }));
    items.sort((a, b) => a.y - b.y);
    for (let k = 1; k < items.length; k++) items[k]!.y = Math.max(items[k]!.y, items[k - 1]!.y + 9);
    const overflow = items.at(-1)!.y - bottom;
    if (overflow > 0) for (const it of items) it.y -= overflow;
    return items;
  }, [series, ticks, y0, y1, direct]);

  const days: number[] = [];
  const firstDay = Math.ceil((t0 + props.startOffset) / ticksPerDay);
  for (let d = firstDay; d * ticksPerDay - props.startOffset <= t1; d++) days.push(d * ticksPerDay - props.startOffset);

  const h = hover !== null && ticks.length > 0 ? nearest(hover) : null;

  return (
    <figure className="chart">
      <figcaption>{props.title}</figcaption>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="chart-plot">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={props.title}
          onMouseMove={(e) => setHover(tickAt(e.clientX))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => props.onSeek(Math.round(tickAt(e.clientX)))}
        >
          {[0, 0.5, 1].map((f) => {
            const v = y0 + (y1 - y0) * f;
            return (
              <g key={f}>
                <line className="grid" x1={PAD.l} x2={W - right} y1={y(v)} y2={y(v)} />
                <text className="axis" x={PAD.l - 4} y={y(v) + 3} textAnchor="end">{props.format(v)}</text>
              </g>
            );
          })}
          {days.map((t) => (
            <g key={t}>
              <line className="grid" x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} />
              <text className="axis" x={x(t) + 2} y={H - 5}>D{Math.round((t + props.startOffset) / ticksPerDay)}</text>
            </g>
          ))}
          {props.markers.map((t, k) => (
            <line key={k} className="marker-line" x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} />
          ))}
          {series.map((s) => (
            <polyline
              key={s.name}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, k) => `${x(ticks[k]!).toFixed(1)},${y(Number.isFinite(v) ? v : y0).toFixed(1)}`).join(' ')}
            />
          ))}
          {endLabels.map((l) => (
            <g key={l.name}>
              <line x1={W - right + 2} x2={W - right + 7} y1={l.y - 3} y2={l.y - 3} stroke={l.color} strokeWidth={2} strokeLinecap="round" />
              <text className="end-label" x={W - right + 9} y={l.y}>{l.name}</text>
            </g>
          ))}
          <line className="cursor" x1={x(props.cursorTick)} x2={x(props.cursorTick)} y1={PAD.t - 4} y2={H - PAD.b} />
          {h !== null && (
            <g>
              <line className="crosshair" x1={x(ticks[h]!)} x2={x(ticks[h]!)} y1={PAD.t} y2={H - PAD.b} />
              {series.map((s) => (
                <circle key={s.name} cx={x(ticks[h]!)} cy={y(s.values[h] ?? y0)} r={4} fill={s.color} className="dot" />
              ))}
            </g>
          )}
        </svg>
        {h !== null && (
          <div className="tooltip" style={{ left: `${(x(ticks[h]!) / W) * 100}%` }}>
            <div className="muted">{clock(ticks[h]!, ticksPerDay, props.startOffset)} · clic para ir</div>
            {series.map((s) => (
              <div key={s.name}>
                <i style={{ background: s.color }} /> {s.name}: <strong>{props.format(s.values[h] ?? Number.NaN)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

export function clock(tick: number, ticksPerDay: number, startOffset: number): string {
  const total = tick + startOffset;
  const day = Math.floor(total / ticksPerDay);
  const minute = Math.round(((total - day * ticksPerDay) * 1440) / ticksPerDay);
  return `Día ${day} · ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
