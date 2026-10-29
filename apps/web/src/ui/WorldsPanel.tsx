import type { EngineStatus, WorldSummary } from '@worldopen/contracts';
import { useState } from 'react';
import type { NewWorldOptions } from './useEngine';

const STATUS_ES: Record<string, string> = { created: 'nuevo', running: 'en marcha', paused: 'en pausa', ended: 'terminado' };

/** Histórico de mundos (T5): crear, abrir y terminar. Un mundo terminado se abre en solo lectura. */
export function WorldsPanel(props: {
  worlds: WorldSummary[];
  status: EngineStatus | null;
  isAdmin: boolean;
  onNew: (o: NewWorldOptions) => void;
  onOpen: (worldId: string) => void;
  onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Nuevo mundo');
  const [seed, setSeed] = useState(1);
  const [population, setPopulation] = useState(50);
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
                props.onNew({ name, seed, population });
              }}
            >
              <input aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
              <input aria-label="Semilla" type="number" value={seed} onChange={(e) => setSeed(e.target.valueAsNumber || 0)} />
              <input aria-label="Habitantes" type="number" min={0} max={10000} value={population} onChange={(e) => setPopulation(e.target.valueAsNumber || 0)} />
              <button type="submit">Crear</button>
            </form>
          )}
          <ol className="world-list">
            {props.worlds.map((w) => (
              <li key={w.worldId} className={w.worldId === current ? 'current' : ''}>
                <span title={w.worldId}>{w.name}</span>
                <span className="muted small">{STATUS_ES[w.status]} · tick {w.lastTick}</span>
                {w.worldId !== current && (
                  <button type="button" onClick={() => props.onOpen(w.worldId)}>{w.status === 'ended' ? 'Ver' : 'Abrir'}</button>
                )}
              </li>
            ))}
          </ol>
          {props.isAdmin && props.status && !props.status.readOnly && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm('¿Terminar este mundo? Quedará guardado en solo lectura.')) props.onEnd();
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
