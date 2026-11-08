import { useState } from 'react';
import type { WorldRenderer } from '@worldopen/render';
import { usePanelOpen } from './usePanelOpen';

/** Teclas y ratón para moverse por el mapa (ADR-0056). */
const KEYS: [string, string][] = [
  ['W A S D · flechas', 'desplazarse'],
  ['Q · E', 'girar la vista'],
  ['R · F · + · −', 'acercar · alejar'],
  ['Mayús', 'más deprisa'],
  ['Arrastrar con el botón izquierdo', 'girar la vista'],
  ['Arrastrar con el botón derecho', 'desplazarse'],
  ['Rueda del ratón', 'acercar · alejar'],
  ['Clic', 'inspeccionar persona, animal o edificio'],
];

/** Colores de camiseta por actividad (si se activan). */
const ACTIVITIES: [string, string][] = [
  ['#3d6fd1', 'sin hacer nada'],
  ['#f08a24', 'de camino'],
  ['#8d6e63', 'trabajando'],
  ['#2fb37a', 'con gente'],
  ['#fdd835', 'comiendo'],
  ['#ff4fa3', 'en una cola'],
  ['#e53935', 'huyendo'],
];

/** Leyenda de controles de la cámara y opciones de vista. */
export function Controls({ renderer }: { renderer: WorldRenderer }) {
  const [open, setOpen] = usePanelOpen('controls', true);
  const [activity, setActivity] = useState(false);
  return (
    <section className="panel controls" aria-label="Controles">
      <header>
        <h2>Controles</h2>
        <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Ocultar' : 'Mostrar'}
        </button>
      </header>
      {open && (
        <>
          <dl className="keys small">
            {KEYS.map(([k, what]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <div className="small muted">
            Personas, coches y animales se mueven siempre a paso real; con el tiempo acelerado, si se quedan atrás, saltan
            hasta donde ya están.
          </div>
          <label className="small toggle">
            <input
              type="checkbox"
              checked={activity}
              onChange={(e) => {
                setActivity(e.target.checked);
                renderer.setActivityColors(e.target.checked);
              }}
            />{' '}
            Camisetas del color de la actividad
          </label>
          {activity && (
            <div className="small legend">
              {ACTIVITIES.map(([c, label]) => (
                <span key={label}>
                  <i style={{ background: c }} /> {label}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
