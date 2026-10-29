import { useRef } from 'react';
import { EventLog } from './EventLog';
import { GodPanel } from './GodPanel';
import { Hud } from './Hud';
import { Inspector } from './Inspector';
import { TimeControls } from './TimeControls';
import { StudyView } from './study/StudyView';
import { useEngine, type AppSession } from './useEngine';
import { WorldsPanel } from './WorldsPanel';

export function App({ session }: { session: AppSession }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const engine = useEngine(canvas, session);
  const isAdmin = engine.issuer.role === 'admin';
  const readOnly = engine.status?.readOnly ?? false;
  const studying = engine.status?.mode === 'replay';

  return (
    <div className="app">
      <canvas
        ref={canvas}
        className="viewport"
        onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          // Clic (sin arrastre de cámara): selecciona lo que hay bajo el puntero.
          const d = down.current;
          if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || !engine.renderer) return;
          engine.select(engine.renderer.pick(e.clientX, e.clientY));
        }}
      />
      <div className="overlay top-left">
        <Hud manifest={engine.manifest} status={engine.status} population={engine.population} economy={engine.economy} />
        {engine.error && (
          <div className="panel error-banner" role="alert">⚠ {engine.error}</div>
        )}
        {session.mode === 'server' && (
          <div className="panel user-bar small">
            <span>
              {session.name} · {session.role === 'admin' ? 'Dios (administrador)' : 'observador'} · mundo compartido
            </span>
            <button type="button" className="link" onClick={engine.logout}>Salir</button>
          </div>
        )}
        {isAdmin && engine.client && engine.status && !readOnly && !studying && <TimeControls client={engine.client} status={engine.status} />}
        <WorldsPanel
          worlds={engine.worlds}
          status={engine.status}
          isAdmin={isAdmin}
          shared={session.mode === 'server'}
          onNew={engine.newWorld}
          onOpen={engine.openWorld}
          onStudy={engine.studyWorld}
          onEnd={engine.endWorld}
        />
        {engine.client && engine.renderer && (
          <Inspector
            client={engine.client}
            renderer={engine.renderer}
            selection={engine.selection}
            isAdmin={isAdmin}
            readOnly={readOnly}
            onSelect={engine.select}
          />
        )}
      </div>
      <div className="overlay right">
        {isAdmin && !readOnly && engine.client && engine.catalog && <GodPanel client={engine.client} catalog={engine.catalog} />}
        {studying && engine.client && engine.status ? (
          <StudyView client={engine.client} status={engine.status} onExit={engine.exitStudy} />
        ) : (
          <EventLog entries={engine.log} />
        )}
      </div>
    </div>
  );
}
