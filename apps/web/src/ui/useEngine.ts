import {
  AgentActivity,
  AgentFlag,
  type CatalogResult,
  type EconomySummary,
  type EngineStatus,
  type Issuer,
  type RenderFrame,
  type SimEvent,
  type WorldManifest,
  type WorldSummary,
} from '@worldopen/contracts';
import { createManifest } from '@worldopen/engine';
import { WorldRenderer, type Pick } from '@worldopen/render';
import { IndexedDbWorldStore } from '@worldopen/store';
import { useCallback, useEffect, useRef, useState } from 'react';
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

export interface PopulationSummary {
  total: number;
  indoors: number;
  walking: number;
  sleeping: number;
  working: number;
  queueing: number;
}

function summarize(f: RenderFrame): PopulationSummary {
  const s = { total: f.agentCount, indoors: 0, walking: 0, sleeping: 0, working: 0, queueing: 0 };
  for (let i = 0; i < f.agentCount; i++) {
    if (f.agentFlags[i]! & AgentFlag.Indoors) s.indoors++;
    else s.walking++;
    const act = f.agentActivities[i];
    if (act === AgentActivity.Sleeping) s.sleeping++;
    else if (act === AgentActivity.Working) s.working++;
    else if (act === AgentActivity.Queueing) s.queueing++;
  }
  return s;
}

export interface NewWorldOptions {
  name: string;
  seed: number;
  population: number;
}

export interface EngineState {
  client: EngineClient | null;
  renderer: WorldRenderer | null;
  manifest: WorldManifest | null;
  status: EngineStatus | null;
  catalog: CatalogResult | null;
  economy: EconomySummary | null;
  log: LogEntry[];
  population: PopulationSummary | null;
  worlds: WorldSummary[];
  selection: Pick;
  issuer: Issuer;
  select(p: Pick): void;
  newWorld(o: NewWorldOptions): void;
  openWorld(worldId: string): void;
  endWorld(): void;
  refreshWorlds(): void;
}

/** Conecta Worker, render, histórico de mundos y UI. Los frames van directos al render, sin pasar por React. */
export function useEngine(canvas: React.RefObject<HTMLCanvasElement | null>): EngineState {
  const [client, setClient] = useState<EngineClient | null>(null);
  const [renderer, setRenderer] = useState<WorldRenderer | null>(null);
  const [manifest, setManifest] = useState<WorldManifest | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [economy, setEconomy] = useState<EconomySummary | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [population, setPopulation] = useState<PopulationSummary | null>(null);
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [selection, setSelection] = useState<Pick>(null);
  const logKey = useRef(0);
  const lastFrame = useRef<RenderFrame | null>(null);
  const store = useRef<IndexedDbWorldStore | null>(null);

  const refreshWorlds = useCallback(() => {
    void store.current?.listWorlds().then(setWorlds).catch(() => setWorlds([]));
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    const r = new WorldRenderer(canvas.current);
    const engine = new EngineClient(LOCAL_ADMIN);
    store.current = new IndexedDbWorldStore();
    const push = (entries: Omit<LogEntry, 'key'>[]) =>
      setLog((prev) => [...entries.map((e) => ({ ...e, key: logKey.current++ })).reverse(), ...prev].slice(0, MAX_LOG));
    let lastEconomy = 0;
    let lastSaved = -2;
    let lastWorldStatus = '';

    const off = engine.on((msg) => {
      switch (msg.type) {
        case 'ready':
          setManifest(msg.manifest);
          setSelection(null);
          r.select(null);
          void engine.query('catalog').then(setCatalog);
          void engine.query('map').then((maps) => r.setMap(maps));
          push([{ tick: msg.tick, kind: 'ok', text: `Mundo «${msg.manifest.name}» listo (motor ${msg.engineVersion})` }]);
          refreshWorlds();
          break;
        case 'frame':
          r.applyFrame(msg.frame);
          lastFrame.current = msg.frame;
          break;
        case 'status': {
          setStatus(msg.status);
          // Cada guardado (o cambio de estado del mundo) puede cambiar la lista del histórico.
          if (msg.status.savedTick !== lastSaved || msg.status.worldStatus !== lastWorldStatus) {
            lastSaved = msg.status.savedTick;
            lastWorldStatus = msg.status.worldStatus;
            refreshWorlds();
          }
          if (lastFrame.current) setPopulation(summarize(lastFrame.current));
          const now = performance.now();
          if (now - lastEconomy > 1000) {
            lastEconomy = now;
            void engine.query('economy').then(setEconomy);
          }
          break;
        }
        case 'events':
          push(msg.events.filter((e) => e.type !== 'agent.spawned' || msg.events.length < 20).map((e) => ({ tick: e.tick, kind: 'event', text: describeEvent(e) })));
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

    // Al arrancar se reabre el último mundo sin terminar; si no hay, se crea uno nuevo.
    void store.current
      .listWorlds()
      .catch(() => [])
      .then((list) => {
        setWorlds(list);
        const resume = list.find((w) => w.status !== 'ended');
        if (resume) engine.load(resume.worldId);
        else engine.init(newManifest({ name: 'Valdeolivo · primer mundo', seed: 1, population: 50 }));
      });

    setClient(engine);
    setRenderer(r);
    (window as unknown as { __worldopen: unknown }).__worldopen = { engine, renderer: r };

    return () => {
      off();
      engine.dispose();
      r.dispose();
    };
  }, [canvas, refreshWorlds]);

  const select = useCallback(
    (p: Pick) => {
      setSelection(p);
      renderer?.select(p);
    },
    [renderer],
  );

  return {
    client,
    renderer,
    manifest,
    status,
    catalog,
    economy,
    log,
    population,
    worlds,
    selection,
    issuer: LOCAL_ADMIN,
    select,
    newWorld: (o) => client?.init(newManifest(o)),
    openWorld: (id) => client?.load(id),
    endWorld: () => client?.end(),
    refreshWorlds,
  };
}

function newManifest(o: NewWorldOptions): WorldManifest {
  return createManifest({
    worldId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    seed: o.seed,
    name: o.name,
    criteria: { 'society.initialPopulation': o.population },
  });
}

const RESOURCE_ES: Record<number, string> = { 1: 'comida', 2: 'agua', 3: 'leña' };

function describeEvent(e: SimEvent): string {
  const d = e.data;
  switch (e.type) {
    case 'agent.spawned': return `Llega ${String(d.name)} (vive en ${String(d.home)})`;
    case 'agent.removed': return `${String(d.name)} ha desaparecido del mundo`;
    case 'agent.seekingShelter': return `${String(d.name)} busca cobijo en ${String(d.building)}`;
    case 'agent.friendship': return `${String(d.name)} y ${String(d.friend)} se hacen amigos`;
    case 'source.empty': return `${String(d.name)} no encuentra ${RESOURCE_ES[Number(d.resource)] ?? 'género'} en ${String(d.building)}`;
    case 'fire.started': return `🔥 Arde ${String(d.building)} (${String(d.use)}); lo ven ${String(d.witnesses)} vecinos`;
    case 'fire.ended': return `El fuego de ${String(d.building)} se ha apagado; queda dañado`;
    case 'building.repaired': return `${String(d.building)} vuelve a estar en uso`;
    case 'criteria.changed': return `Criterio ${String(d.key)}: ${String(d.previous)} → ${String(d.value)}`;
    default: return `${e.type} ${JSON.stringify(d)}`;
  }
}
