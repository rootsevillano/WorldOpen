import { useState } from 'react';
import type { LogEntry } from './useEngine';

export function EventLog({ entries }: { entries: LogEntry[] }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="panel log" aria-label="Registro de eventos">
      <header>
        <h2>Eventos</h2>
        <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Ocultar' : 'Mostrar'}
        </button>
      </header>
      {open && (
        <ol>
          {entries.length === 0 && <li className="muted">Sin eventos todavía.</li>}
          {entries.map((e) => (
            <li key={e.key} className={e.kind}>
              {e.tick >= 0 && <span className="muted">[{e.tick}] </span>}
              {e.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
