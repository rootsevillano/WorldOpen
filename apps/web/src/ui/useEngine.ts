import type { CatalogResult, EngineStatus, Issuer, SimEvent, WorldManifest } from '@worldopen/contracts';
import { createManifest } from '@worldopen/engine';
import { WorldRenderer } from '@worldopen/render';
import { useEffect, useRef, useState } from 'react';
import { EngineClient } from '../engine-host/EngineClient';

/** MVP local: el host local actúa como administrador (ADR-0006). */
const LOCAL_ADMIN: Issuer = { userId: 'local', role: 'admin' };
const MAX_LOG = 200;

export interface LogEntry {
  key: number;
  tick: number;
  text: string;
  kind: 'event' | 'ok' | 'error';
}

export interface EngineState {
  client: EngineClient | null;
  manifest: WorldManifest | null;
  status: EngineStatus | null;
  catalog: CatalogResult | null;
  log: LogEntry[];
  issuer: Issuer;
}

/** Conecta Worker, render y UI. Los frames van directos al render, sin pasar por el estado de React. */
export function useEngine(canvas: React.RefObject<HTMLCanvasElement | null>): EngineState {
  const [client, setClient] = useState<EngineClient | null>(null);
  const [manifest, setManifest] = useState<WorldManifest | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logKey = useRef(0);

  useEffect(() => {
    if (!canvas.current) return;
    const renderer = new WorldRenderer(canvas.current);
    const engine = new EngineClient(LOCAL_ADMIN);
    const m = createManifest({ worldId: crypto.randomUUID(), createdAt: new Date().toISOString(), seed: 1 });
    const push = (entries: Omit<LogEntry, 'key'>[]) =>
      setLog((prev) => [...entries.map((e) => ({ ...e, key: logKey.current++ })).reverse(), ...prev].slice(0, MAX_LOG));

    const off = engine.on((msg) => {
      switch (msg.type) {
        case 'ready':
          void engine.query('catalog').then(setCatalog);
          push([{ tick: msg.tick, kind: 'ok', text: `Mundo listo (motor ${msg.engineVersion})` }]);
          break;
        case 'frame':
          renderer.applyFrame(msg.frame);
          break;
        case 'status':
          setStatus(msg.status);
          break;
        case 'events':
          push(msg.events.map((e) => ({ tick: e.tick, kind: 'event', text: describeEvent(e) })));
          if (msg.events.some((e) => e.type === 'criteria.changed')) void engine.query('catalog').then(setCatalog);
          break;
        case 'commandRejected':
          push([{ tick: -1, kind: 'error', text: `Comando rechazado: ${msg.message}` }]);
          break;
        case 'error':
          push([{ tick: -1, kind: 'error', text: `Error del motor: ${msg.message}` }]);
          break;
      }
    });

    engine.init(m);
    engine.play();
    setManifest(m);
    setClient(engine);
    (window as unknown as { __worldopen: unknown }).__worldopen = { engine, renderer };

    return () => {
      off();
      engine.dispose();
      renderer.dispose();
    };
  }, [canvas]);

  return { client, manifest, status, catalog, log, issuer: LOCAL_ADMIN };
}

function describeEvent(e: SimEvent): string {
  if (e.type === 'criteria.changed') return `Criterio ${String(e.data.key)}: ${String(e.data.previous)} → ${String(e.data.value)}`;
  return `${e.type} ${JSON.stringify(e.data)}`;
}
