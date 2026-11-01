import type { EngineStatus, MapPackManifest, WorldSummary } from '@worldopen/contracts';
import { useState } from 'react';
import type { NewWorldOptions } from './useEngine';

const STATUS_ES: Record<string, string> = { created: 'nuevo', running: 'en marcha', paused: 'en pausa', ended: 'terminado' };

/** Histórico de mundos (T5): crear, abrir y terminar. Un mundo terminado se abre en solo lectura. */
export function WorldsPanel(props: {
  worlds: WorldSummary[];
  mapPacks: MapPackManifest[];
  status: EngineStatus | null;
  isAdmin: boolean;
  /** Mundo compartido en un servidor: crear/abrir/terminar afecta a todos. */
  shared: boolean;
  onNew: (o: NewWorldOptions) => void;
  onOpen: (worldId: string) => void;
  onStudy: (worldId: string) => void;
  onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Nuevo mundo');
  const [seed, setSeed] = useState(1);
  const [population, setPopulation] = useState(50);
  const [mapPack, setMapPack] = useState('');
  const [month, setMonth] = useState(3);
  const [day, setDay] = useState(21);
  const [towns, setTowns] = useState(1);
  const current = props.status?.worldId;

  return (
    <section className="panel worlds" aria-label="Mundos">
      <header>
        <h2>Mundos</h2>
        <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Ocultar' : 'Mostrar'}
        </button>
      </header>
      {props.status && (
        <div className="small muted">
          {STATUS_ES[props.status.worldStatus]}
          {props.status.readOnly ? ' · solo lectura' : ''} · guardado en el tick {props.status.savedTick}
        </div>
      )}
      {open && (
        <>
          {props.isAdmin && (
            <form
              className="new-world"
              onSubmit={(e) => {
                e.preventDefault();
                props.onNew({ name, seed, population, start: { month, day }, towns, ...(mapPack ? { mapPack } : {}) });
              }}
            >
              <input aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
              <input aria-label="Semilla" type="number" value={seed} onChange={(e) => setSeed(e.target.valueAsNumber || 0)} />
              <input aria-label="Habitantes" type="number" min={0} max={10000} value={population} onChange={(e) => setPopulation(e.target.valueAsNumber || 0)} />
              <select aria-label="Mapa" value={mapPack} onChange={(e) => setMapPack(e.target.value)}>
                <option value="">Mapa sintético</option>
                {props.mapPacks.map((m) => (
                  <option key={`${m.id}-${m.version}`} value={`${m.id}-${m.version}`}>
                    {m.displayName} ({m.version})
                  </option>
                ))}
              </select>
              <label className="small">
                Empieza el{' '}
                <input aria-label="Día de inicio" type="number" min={1} max={30} value={day} onChange={(e) => setDay(Math.min(30, Math.max(1, e.target.valueAsNumber || 1)))} />
                {' de '}
                <select aria-label="Mes de inicio" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTHS.map((n, k) => (
                    <option key={n} value={k + 1}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="small">
                Pueblos{' '}
                <input aria-label="Pueblos" type="number" min={1} max={3} value={towns} onChange={(e) => setTowns(Math.min(3, Math.max(1, e.target.valueAsNumber || 1)))} />
              </label>
              <button type="submit">Crear</button>
            </form>
          )}
          <ol className="world-list">
            {props.worlds.map((w) => (
              <li key={w.worldId} className={w.worldId === current ? 'current' : ''}>
                <span title={w.worldId}>{w.name}</span>
                <span className="muted small">{STATUS_ES[w.status]} · tick {w.lastTick}</span>
                <span className="world-actions">
                  {props.isAdmin && w.worldId !== current && w.status !== 'ended' && (
                    <button type="button" onClick={() => props.onOpen(w.worldId)}>Abrir</button>
                  )}
                  {(w.worldId !== current || props.status?.mode !== 'replay') && (
                    <button type="button" title="Visor de estudio: reproducir lo grabado" onClick={() => props.onStudy(w.worldId)}>Estudiar</button>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {props.isAdmin && props.status && !props.status.readOnly && props.status.mode === 'live' && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                const who = props.shared ? ' para todos los conectados' : '';
                if (confirm(`¿Terminar este mundo${who}? Quedará guardado en solo lectura.`)) props.onEnd();
              }}
            >
              Terminar este mundo
            </button>
          )}
        </>
      )}
    </section>
  );
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
