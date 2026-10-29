import { useRef } from 'react';
import { EventLog } from './EventLog';
import { GodPanel } from './GodPanel';
import { Hud } from './Hud';
import { TimeControls } from './TimeControls';
import { useEngine } from './useEngine';

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useEngine(canvas);
  const isAdmin = engine.issuer.role === 'admin';

  return (
    <div className="app">
      <canvas ref={canvas} className="viewport" />
      <div className="overlay top-left">
        <Hud manifest={engine.manifest} status={engine.status} population={engine.population} />
        {engine.client && engine.status && <TimeControls client={engine.client} status={engine.status} />}
      </div>
      <div className="overlay right">
        {isAdmin && engine.client && engine.catalog && <GodPanel client={engine.client} catalog={engine.catalog} />}
        <EventLog entries={engine.log} />
      </div>
    </div>
  );
}
