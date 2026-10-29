import { useRef } from 'react';
import { EventLog } from './EventLog';
import { GodPanel } from './GodPanel';
import { Hud } from './Hud';
import { Inspector } from './Inspector';
import { TimeControls } from './TimeControls';
import { useEngine } from './useEngine';
import { WorldsPanel } from './WorldsPanel';

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const engine = useEngine(canvas);
  const isAdmin = engine.issuer.role === 'admin';
  const readOnly = engine.status?.readOnly ?? false;

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
        {engine.client && engine.status && !readOnly && <TimeControls client={engine.client} status={engine.status} />}
        <WorldsPanel
          worlds={engine.worlds}
          status={engine.status}
          isAdmin={isAdmin}
          onNew={engine.newWorld}
          onOpen={engine.openWorld}
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
        <EventLog entries={engine.log} />
      </div>
    </div>
  );
}
