import { STUDY_METRICS, type AnalysisProgress, type EngineStatus, type LoggedCommand, type Timeline } from '@worldopen/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EngineClient } from '../../engine-host/EngineClient';
import { LineChart, clock, type Series } from './LineChart';

/** Muestra una muestra por hora de juego. */
const SAMPLE_MINUTES = 60;

/** Slots categóricos (variante oscura) validados con el script de la guía de visualización: orden fijo por entidad. */
const C = { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', yellow: '#c98500', magenta: '#d55181' };

const SPEEDS: { label: string; value: number | 'max' }[] = [
  { label: '1×', value: 1 },
  { label: '60×', value: 60 },
  { label: '600×', value: 600 },
  { label: 'Máx', value: 'max' },
];

const pct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)} %` : '—');
const num = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) : '—');

/** Un comando se aplica al empezar su tick: su efecto se ve en el tick siguiente. */
const effectTick = (c: LoggedCommand) => c.appliedAtTick + 1;

/** Texto de un marcador (intervención de Dios) en la línea de tiempo. */
function describe(c: LoggedCommand): string {
  const p = c.envelope.payload as Record<string, unknown>;
  switch (c.envelope.type) {
    case 'criteria.set': return `${String(p.key)} = ${String(p.value)}`;
    case 'disaster.fire': return `Incendio en ${String(p.buildingId)}`;
    case 'agent.spawn': return `Crea ${String(p.count ?? 1)} habitante(s)`;
    case 'agent.remove': return `Elimina al habitante ${String(p.agentId)}`;
    default: return c.envelope.type;
  }
}

/**
 * Visor de estudio (T5, ADR-0015): reproduce un mundo guardado. Al abrirlo pide un análisis completo en segundo plano
 * (series por hora + verificación del replay contra los snapshots) y dibuja la línea de tiempo con las intervenciones.
 */
export function StudyView({ client, status, onExit }: { client: EngineClient; status: EngineStatus; onExit: () => void }) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisProgress | null>(null);
  const [version, setVersion] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const data = useRef<{ ticks: number[]; values: Record<string, number[]> }>({ ticks: [], values: {} });

  useEffect(() => {
    data.current = { ticks: [], values: Object.fromEntries(STUDY_METRICS.map((m) => [m, []])) };
    setAnalysis(null);
    setVersion(0);
    let alive = true;
    let pending = false;
    const off = client.on((msg) => {
      if (msg.type !== 'series') return;
      const d = data.current;
      d.ticks.push(...msg.chunk.ticks);
      for (const [k, v] of Object.entries(msg.chunk.values)) d.values[k]!.push(...v);
      setAnalysis(msg.analysis);
      // Se redibuja como mucho cuatro veces por segundo mientras llega el análisis.
      if (!pending) {
        pending = true;
        setTimeout(() => {
          pending = false;
          if (alive) setVersion((x) => x + 1);
        }, 250);
      }
    });
    void client.query('timeline').then((tl) => {
      if (!alive || !tl) return;
      setTimeline(tl);
      client.analyze(Math.max(1, Math.round(SAMPLE_MINUTES / tl.time.minutesPerTick)), [...STUDY_METRICS]);
    });
    return () => {
      alive = false;
      off();
    };
  }, [client, status.worldId]);

  const ticksPerDay = timeline ? 1440 / timeline.time.minutesPerTick : 1440;
  const startOffset = timeline ? (timeline.time.start.hour * 60 + timeline.time.start.minute) / timeline.time.minutesPerTick : 0;
  const markers = useMemo(() => timeline?.commands.map((c) => c.appliedAtTick) ?? [], [timeline]);
  const d = data.current;
  const pick = (m: string) => d.values[m] ?? [];

  const charts = useMemo(() => {
    void version;
    const s = (name: string, color: string, metric: string): Series => ({ name, color, values: pick(metric) });
    return [
      { title: '¿Dónde está la gente?', domain: [0, 1] as [number, number], format: pct, series: [
        s('En casa', C.blue, 'agents.atHomeRatio'), s('Trabajando', C.orange, 'agents.workingRatio'),
        s('Ocio', C.aqua, 'agents.leisureRatio'), s('En la calle', C.yellow, 'agents.outdoorsRatio'),
        s('En cola', C.magenta, 'agents.queueingRatio'),
      ] },
      { title: 'Necesidades medias (1 = cubiertas)', domain: [0, 1] as [number, number], format: pct, series: [
        s('Hambre', C.blue, 'agents.avgHunger'), s('Sed', C.orange, 'agents.avgThirst'),
        s('Social', C.aqua, 'agents.avgSocial'), s('Salud', C.yellow, 'agents.avgHealth'),
      ] },
      { title: 'Comida en las tiendas', format: num, series: [s('Comida', C.blue, 'economy.shopFood')] },
      { title: 'Temperatura (°C)', format: num, series: [s('Temperatura', C.blue, 'env.temperatureC')] },
      { title: 'Habitantes', format: num, series: [s('Habitantes', C.blue, 'agents.count')] },
    ];
  }, [version]);

  if (!timeline) return <div className="panel study-bar">Cargando la línea de tiempo…</div>;
  const span = Math.max(1, timeline.endTick - timeline.startTick);
  const pos = (t: number) => `${((t - timeline.startTick) / span) * 100}%`;
  const shownTick = scrub ?? status.tick;
  const v = analysis?.verification;

  const downloadCsv = () => {
    const metrics = [...STUDY_METRICS];
    const rows = [['tick', 'momento', ...metrics].join(',')];
    d.ticks.forEach((t, k) => rows.push([t, clock(t, ticksPerDay, startOffset), ...metrics.map((m) => d.values[m]![k])].join(',')));
    const url = URL.createObjectURL(new Blob([rows.join('\n') + '\n'], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${timeline.name.replace(/[^\w-]+/g, '_')}-series.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="panel study-charts" aria-label="Series del mundo">
        <header>
          <h2>Estudio · {timeline.name}</h2>
          <button type="button" className="link" onClick={downloadCsv} disabled={d.ticks.length === 0}>Descargar CSV</button>
        </header>
        <div className="small muted">
          {analysis
            ? analysis.done
              ? `Análisis completo · ${d.ticks.length} muestras horarias`
              : `Analizando… ${Math.round(analysis.progress * 100)} %`
            : 'Preparando el análisis…'}
          {v && (
            <span className={v.failed.length ? 'verify bad' : 'verify ok'}>
              {' · '}
              {v.failed.length ? `✗ replay distinto en ${v.failed.length} snapshot(s)` : `✓ replay verificado ${v.checked}/${v.total}`}
            </span>
          )}
        </div>
        {charts.map((c) => (
          <LineChart
            key={c.title}
            title={c.title}
            ticks={d.ticks}
            series={c.series}
            cursorTick={shownTick}
            markers={markers}
            ticksPerDay={ticksPerDay}
            startOffset={startOffset}
            format={c.format}
            {...(c.domain ? { domain: c.domain } : {})}
            onSeek={(t) => client.seek(t)}
          />
        ))}
      </section>

      <section className="panel study-bar" aria-label="Línea de tiempo">
        <div className="study-controls">
          <button type="button" onClick={() => (status.running ? client.pause() : client.play())} disabled={status.tick >= timeline.endTick && !status.running}>
            {status.running ? '❚❚' : '▶'}
          </button>
          {SPEEDS.map((s) => (
            <button key={s.label} type="button" className={status.ticksPerSecond === s.value ? 'active' : ''} onClick={() => client.setSpeed(s.value)}>
              {s.label}
            </button>
          ))}
          <span className="study-clock" data-testid="study-clock">{clock(shownTick, ticksPerDay, startOffset)}</span>
          <span className="muted small">tick {shownTick} / {timeline.endTick}</span>
          <span className="spacer" />
          <button type="button" onClick={onExit}>Salir del estudio</button>
        </div>
        <div className="timeline">
          <div className="timeline-markers">
            {timeline.commands.map((c, k) => (
              <button
                key={k}
                type="button"
                className={`tl-marker ${c.envelope.type.split('.')[0]}`}
                style={{ left: pos(c.appliedAtTick) }}
                title={`${clock(c.appliedAtTick, ticksPerDay, startOffset)} · ${describe(c)}`}
                aria-label={describe(c)}
                onClick={() => client.seek(effectTick(c))}
              />
            ))}
          </div>
          <input
            type="range"
            aria-label="Momento del mundo"
            min={timeline.startTick}
            max={timeline.endTick}
            value={shownTick}
            onChange={(e) => {
              const t = e.target.valueAsNumber;
              setScrub(t);
              client.seek(t);
            }}
            onPointerUp={() => setScrub(null)}
            onKeyUp={() => setScrub(null)}
          />
        </div>
        <ol className="study-events small">
          {timeline.commands.map((c, k) => (
            <li key={k}>
              <button type="button" className="link inline" onClick={() => client.seek(effectTick(c))}>
                {clock(c.appliedAtTick, ticksPerDay, startOffset)}
              </button>{' '}
              {describe(c)}
            </li>
          ))}
          {timeline.commands.length === 0 && <li className="muted">Dios no intervino en este mundo.</li>}
        </ol>
      </section>
    </>
  );
}
