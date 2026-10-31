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
import { WorldRenderer, type Pick, type RenderPack } from '@worldopen/render';
import type { MapPackManifest, RegionRef } from '@worldopen/contracts';
import { IndexedDbWorldStore } from '@worldopen/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EngineClient } from '../engine-host/EngineClient';
import { SocketTransport, WorkerTransport } from '../engine-host/transport';

/** Modo local (motor en un Worker, el usuario es Dios) o servidor (sesión con rol, ADR-0016). */
export type AppSession = { mode: 'local' } | { mode: 'server'; name: string; role: 'admin' | 'observer' };

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
  /** `<id>-<versión>` de un map-pack instalado; sin él, mapa sintético. */
  mapPack?: string;
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
  /** Último error visible (se borra solo a los pocos segundos). */
  error: string | null;
  worlds: WorldSummary[];
  /** Map-packs disponibles para crear mundos. */
  mapPacks: MapPackManifest[];
  selection: Pick;
  issuer: Issuer;
  session: AppSession;
  select(p: Pick): void;
  newWorld(o: NewWorldOptions): void;
  openWorld(worldId: string): void;
  studyWorld(worldId: string): void;
  exitStudy(): void;
  endWorld(): void;
  refreshWorlds(): void;
  logout(): void;
}

/**
 * Conecta motor (Worker o servidor), render, histórico de mundos y UI. Los frames van directos al render.
 * En modo servidor, el visor de estudio abre su propia conexión privada y el mundo compartido no cambia.
 */
export function useEngine(canvas: React.RefObject<HTMLCanvasElement | null>, session: AppSession): EngineState {
  const issuer: Issuer = session.mode === 'server' ? { userId: session.name, role: session.role } : LOCAL_ADMIN;
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
  const [error, setError] = useState<string | null>(null);
  const [mapPacks, setMapPacks] = useState<MapPackManifest[]>([]);
  const logKey = useRef(0);
  const lastFrame = useRef<RenderFrame | null>(null);
  const store = useRef<IndexedDbWorldStore | null>(null);
  /** Conecta un cliente como activo (escuchas incluidas) y desconecta el anterior. */
  const activate = useRef<(c: EngineClient) => void>(() => {});
  const active = useRef<EngineClient | null>(null);
  const resuming = useRef(false);

  const refreshWorlds = useCallback(() => {
    if (session.mode === 'server') {
      void fetch('/api/worlds').then((r) => (r.ok ? r.json() : [])).then(setWorlds).catch(() => setWorlds([]));
    } else {
      void store.current?.listWorlds().then(setWorlds).catch(() => setWorlds([]));
    }
  }, [session.mode]);

  useEffect(() => {
    if (!canvas.current) return;
    const r = new WorldRenderer(canvas.current);
    store.current = session.mode === 'local' ? new IndexedDbWorldStore() : null;
    const push = (entries: Omit<LogEntry, 'key'>[]) =>
      setLog((prev) => [...entries.map((e) => ({ ...e, key: logKey.current++ })).reverse(), ...prev].slice(0, MAX_LOG));
    let errorTimer: ReturnType<typeof setTimeout> | null = null;
    const showError = (text: string) => {
      setError(text);
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(() => setError(null), 8000);
    };

    let off: (() => void) | null = null;
    let lastEconomy = 0;
    let lastSaved = -2;
    let lastWorldStatus = '';
    activate.current = (engine: EngineClient) => {
      off?.();
      lastSaved = -2;
      off = engine.on((msg) => {
        switch (msg.type) {
          case 'ready':
            resuming.current = false;
            setManifest(msg.manifest);
            setSelection(null);
            r.select(null);
            void engine.query('catalog').then(setCatalog);
            void Promise.all([engine.query('map'), renderPacks(msg.manifest.regions)]).then(([maps, packs]) => r.setMap(maps, packs));
            push([{ tick: msg.tick, kind: 'ok', text: `Mundo «${msg.manifest.name}» listo (motor ${msg.engineVersion})` }]);
            refreshWorlds();
            break;
          case 'frame':
            r.applyFrame(msg.frame);
            lastFrame.current = msg.frame;
            break;
          case 'status': {
            setStatus(msg.status);
            if (lastFrame.current) setPopulation(summarize(lastFrame.current));
            // Cada guardado (o cambio de estado del mundo) puede cambiar la lista del histórico.
            if (msg.status.savedTick !== lastSaved || msg.status.worldStatus !== lastWorldStatus) {
              lastSaved = msg.status.savedTick;
              lastWorldStatus = msg.status.worldStatus;
              refreshWorlds();
            }
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
            showError(`Comando rechazado: ${msg.message}`);
            break;
          case 'error':
            push([{ tick: -1, kind: 'error', text: `Error del motor: ${msg.message}` }]);
            showError(msg.message);
            if (resuming.current) {
              resuming.current = false;
              push([{ tick: -1, kind: 'error', text: 'No se pudo reabrir el último mundo; se crea uno nuevo.' }]);
              engine.init(newManifest({ name: 'Nuevo mundo', seed: 1, population: 50 }));
            }
            break;
        }
      });
      active.current = engine;
      setClient(engine);
    };

    const engine =
      session.mode === 'server'
        ? new EngineClient(issuer, new SocketTransport('/ws/live', true))
        : new EngineClient(LOCAL_ADMIN, new WorkerTransport());
    activate.current(engine);

    if (session.mode === 'local') {
      // Al arrancar se reabre el último mundo sin terminar; si no hay, se crea uno nuevo.
      void store.current!
        .listWorlds()
        .catch(() => [])
        .then((list) => {
          setWorlds(list);
          const resume = list.find((w) => w.status !== 'ended');
          if (resume) {
            resuming.current = true;
            engine.load(resume.worldId);
          } else engine.init(newManifest({ name: 'Valdeolivo · primer mundo', seed: 1, population: 50 }));
        });
    }

    void fetch('/map-packs/index.json').then((res) => (res.ok ? res.json() : [])).then(setMapPacks).catch(() => setMapPacks([]));
    setRenderer(r);
    (window as unknown as { __worldopen: unknown }).__worldopen = {
      get engine() {
        return active.current;
      },
      renderer: r,
    };

    return () => {
      off?.();
      active.current?.dispose();
      r.dispose();
    };
    // La sesión no cambia sin recargar la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, refreshWorlds]);

  const select = useCallback(
    (p: Pick) => {
      setSelection(p);
      renderer?.select(p);
    },
    [renderer],
  );

  /** Servidor: el visor de estudio va por una conexión privada que sustituye a la del mundo vivo mientras dura. */
  const openStudySocket = (worldId: string) => {
    active.current?.dispose();
    const study = new EngineClient(issuer, new SocketTransport('/ws/study', false));
    activate.current(study);
    study.replay(worldId);
  };

  const backToLive = () => {
    active.current?.dispose();
    activate.current(new EngineClient(issuer, new SocketTransport('/ws/live', true)));
  };

  return {
    client,
    renderer,
    manifest,
    status,
    catalog,
    economy,
    log,
    population,
    error,
    worlds,
    mapPacks,
    selection,
    issuer,
    session,
    select,
    newWorld: (o) => client?.init(newManifest(o, mapPacks.find((m) => `${m.id}-${m.version}` === o.mapPack))),
    openWorld: (id) => {
      const w = worlds.find((x) => x.worldId === id);
      // Un mundo terminado solo se puede estudiar.
      if (w?.status === 'ended') {
        if (session.mode === 'server') openStudySocket(id);
        else client?.replay(id);
      } else client?.load(id);
    },
    studyWorld: (id) => (session.mode === 'server' ? openStudySocket(id) : client?.replay(id)),
    exitStudy: () => {
      if (session.mode === 'server') {
        backToLive();
        return;
      }
      const w = worlds.find((x) => x.status !== 'ended');
      if (w) client?.load(w.worldId);
      else client?.init(newManifest({ name: 'Nuevo mundo', seed: 1, population: 50 }));
    },
    endWorld: () => client?.end(),
    refreshWorlds,
    logout: () => {
      void fetch('/api/logout', { method: 'POST' }).finally(() => location.reload());
    },
  };
}

function newManifest(o: NewWorldOptions, pack?: MapPackManifest): WorldManifest {
  const regions: RegionRef[] | undefined = pack
    ? [{ id: 'r1', displayName: pack.displayName, mapPack: { id: pack.id, version: pack.version }, offset: { x: 0, z: 0 } }]
    : undefined;
  return createManifest({
    worldId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    seed: o.seed,
    name: o.name,
    criteria: { 'society.initialPopulation': o.population },
    ...(regions ? { regions } : {}),
  });
}

/** Recursos de dibujo de las regiones con map-pack (el render los descarga del propio map-pack). */
async function renderPacks(regions: RegionRef[]): Promise<RenderPack[]> {
  const out: RenderPack[] = [];
  for (const r of regions) {
    if (!r.mapPack) continue;
    const base = `/map-packs/${r.mapPack.id}-${r.mapPack.version}`;
    const m = (await (await fetch(`${base}/manifest.json`)).json()) as MapPackManifest;
    out.push({ base, render: m.render });
  }
  return out;
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
    case 'agent.born': return `👶 Nace un bebé en ${String(d.home)} (madre: ${String(d.mother)})`;
    case 'agent.died': return `✝ Muere ${String(d.name)} a los ${String(d.age)} años${d.cause === 'starvation' ? ' (por hambre)' : ''}`;
    case 'birth.skipped': return 'Un nacimiento no cabe: se alcanzó la capacidad del mundo';
    case 'job.hired': return `💼 ${String(d.name)} empieza a trabajar en ${String(d.building)}`;
    case 'job.changed': return `${String(d.name)} deja ${String(d.from)} por un trabajo mejor pagado en ${String(d.building)}`;
    case 'household.evicted': return `🏚 ${d.cause === 'mortgage' ? 'Ejecución hipotecaria' : 'Desahucio'} de un hogar de ${String(d.size)} en ${String(d.home)}: se va del pueblo`;
    case 'business.reopened': return `🔑 Reabre ${String(d.building)} con capital de fuera`;
    case 'home.bought': return `🏠 ${String(d.name)} compra su vivienda en ${String(d.home)} por ${String(d.price)}${Number(d.mortgage) > 0 ? ` (hipoteca de ${String(d.mortgage)})` : ''}`;
    case 'mortgage.paidOff': return `${String(d.name)} termina de pagar la hipoteca de ${String(d.home)}`;
    case 'home.investment': return `Un hogar del pueblo compra una vivienda para alquilarla por ${String(d.price)}`;
    case 'dog.adopted': return `🐕 Un hogar de ${String(d.home)} adopta un perro`;
    case 'dog.died': return `Muere un perro de ${String(d.age)} años`;
    case 'job.lost': return `${String(d.name)} pierde su trabajo en ${String(d.building)}`;
    case 'purchase.unaffordable': return `${String(d.name)} no puede pagar en ${String(d.building)}`;
    case 'couple.formed': return `💞 ${String(d.name)} y ${String(d.partner)} empiezan una relación`;
    case 'household.moved': return `${String(d.name)} se muda a ${String(d.home)}`;
    case 'household.arrived': return `🧳 Llega al pueblo un hogar de ${String(d.size)} ${d.size === 1 ? 'persona' : 'personas'} (${String(d.home)})`;
    case 'agent.emigrated': return d.reason === 'eviction' ? `${String(d.name)} se va del pueblo tras el desahucio` : d.reason === 'orphan' ? `${String(d.name)} se va a vivir con familia de fuera` : `${String(d.name)} se va del pueblo a los ${String(d.age)} años`;
    case 'harvest.delivered': return `${String(d.name)} lleva ${String(d.amount)} de cosecha a ${String(d.building)}`;
    case 'fire.started': return `🔥 Arde ${String(d.building)} (${String(d.use)}); lo ven ${String(d.witnesses)} vecinos`;
    case 'fire.ended': return `El fuego de ${String(d.building)} se ha apagado; queda dañado`;
    case 'building.repaired': return `${String(d.building)} vuelve a estar en uso`;
    case 'criteria.changed': return `Criterio ${String(d.key)}: ${String(d.previous)} → ${String(d.value)}`;
    default: return `${e.type} ${JSON.stringify(d)}`;
  }
}
