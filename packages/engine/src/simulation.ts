import {
  ENGINE_VERSION,
  type AgentDetail,
  type BuildingDetail,
  type CatalogResult,
  type EconomySummary,
  type CommandEnvelope,
  type CommandRejectionReason,
  type LoggedCommand,
  type MapLogic,
  type RenderFrame,
  type SimEvent,
  type Snapshot,
  type WorldManifest,
} from '@worldopen/contracts';
import { seedStocks } from './agents/economy';
import { populate } from './agents/population';
import { agentDetail, buildingDetail, economySummary } from './inspect';
import { registerBuiltinCommands } from './commands/builtin';
import { CommandRegistry } from './commands/registry';
import { CriteriaRegistry } from './criteria/registry';
import { NavMap } from './map/navigation';
import { syntheticMap } from './map/synthetic';
import { StateHasher } from './math/hash';
import { Rng } from './math/rng';
import { RULESETS } from './rulesets/contemporary';
import type { Ruleset } from './rulesets/ruleset';
import { tickToDate, validateTimeConfig } from './time/clock';
import { World } from './world/world';

export interface SimulationOptions {
  /** Capacidad del almacén de agentes. Por defecto 10 000 (S1). */
  agentCapacity?: number;
  /** Ruleset explícito (tests); si falta, se toma de `manifest.ruleset`. */
  ruleset?: Ruleset;
  /** Mapas lógicos ya cargados de map-packs, por id de región. Las regiones sin map-pack usan el sintético. */
  maps?: Record<string, MapLogic>;
  /** Uso interno de `restore`: no generar la población inicial. */
  skipPopulation?: boolean;
}

export type SubmitResult =
  | { ok: true; appliedAtTick: number }
  | { ok: false; reason: CommandRejectionReason; message: string };

interface QueuedCommand {
  seq: number;
  appliedAtTick: number;
  envelope: CommandEnvelope;
}

function loadMaps(manifest: WorldManifest, maps: Record<string, MapLogic> = {}): MapLogic[] {
  return manifest.regions.map((region) => {
    const loaded = maps[region.id];
    if (loaded) return loaded;
    if (region.mapPack === null) return syntheticMap(manifest.seed, region);
    throw new Error(`Falta el map-pack ${region.mapPack.id}@${region.mapPack.version} de la región ${region.id}`);
  });
}

/**
 * Motor puro y síncrono (ADR-0002). El host decide cuándo llamar a `step`.
 * Orden de un tick: aplicar comandos programados para el tick → sistemas del ruleset → `tick++`.
 */
export class Simulation {
  readonly manifest: WorldManifest;
  readonly world: World;
  readonly commands = new CommandRegistry();
  private readonly ruleset: Ruleset;
  private queue: QueuedCommand[] = [];
  private seq = 0;
  private readonly log: LoggedCommand[] = [];

  constructor(manifest: WorldManifest, options: SimulationOptions = {}) {
    validateTimeConfig(manifest.time);
    const ruleset = options.ruleset ?? RULESETS[manifest.ruleset];
    if (!ruleset) throw new Error(`Ruleset desconocido: ${manifest.ruleset}`);
    this.manifest = manifest;
    this.ruleset = ruleset;

    const criteria = new CriteriaRegistry();
    for (const def of ruleset.criteria) criteria.define(def);
    registerBuiltinCommands(this.commands);
    for (const def of ruleset.commands) this.commands.register(def);

    this.world = new World(
      manifest.time,
      Rng.fromSeed(manifest.seed),
      criteria,
      criteria.resolve(manifest.criteria),
      options.agentCapacity ?? 10_000,
      new NavMap(loadMaps(manifest, options.maps)),
    );

    if (!options.skipPopulation) {
      const initial = this.world.criteria['society.initialPopulation'];
      const n = typeof initial === 'number' ? Math.min(initial, this.world.agents.capacity) : 0;
      populate(this.world, n);
      seedStocks(this.world);
    }
  }

  /** Restaura un snapshot y, opcionalmente, reprograma los comandos del log posteriores a él. */
  static restore(manifest: WorldManifest, snapshot: Snapshot, log: LoggedCommand[] = [], options: SimulationOptions = {}): Simulation {
    if (snapshot.engineVersion !== ENGINE_VERSION) {
      throw new Error(`Este mundo se grabó con el motor ${snapshot.engineVersion} y no se puede reproducir con el ${ENGINE_VERSION}`);
    }
    const sim = new Simulation(manifest, { ...options, skipPopulation: true });
    const w = sim.world;
    w.tick = snapshot.tick;
    w.rng = new Rng(snapshot.rngState);
    w.criteria = { ...snapshot.criteria };
    w.agents.restore(snapshot.agents);
    w.buildings.restore(snapshot.buildings);
    for (const entry of snapshot.pendingCommands) sim.enqueueLogged(entry);
    if (sim.hash() !== snapshot.hash) throw new Error('El snapshot restaurado no coincide con su hash');
    // Los comandos del log ya pendientes en el snapshot no se duplican.
    const pendingIds = new Set(snapshot.pendingCommands.map((c) => c.envelope.id));
    for (const entry of log) {
      if (entry.appliedAtTick < snapshot.tick) sim.log.push(entry);
      else if (!pendingIds.has(entry.envelope.id)) sim.enqueueLogged(entry);
    }
    return sim;
  }

  get tick(): number {
    return this.world.tick;
  }

  /** Valida y programa un comando externo (ADR-0005). */
  submit(envelope: CommandEnvelope): SubmitResult {
    const check = this.commands.check(envelope, this.world);
    if (!check.ok) return check;
    const appliedAtTick = Math.max(envelope.atTick ?? 0, this.world.tick);
    this.insert({ seq: this.seq++, appliedAtTick, envelope });
    return { ok: true, appliedAtTick };
  }

  /** Avanza `n` ticks. */
  step(n = 1): void {
    for (let i = 0; i < n; i++) this.stepOnce();
  }

  private stepOnce(): void {
    const w = this.world;
    while (this.queue.length > 0 && this.queue[0]!.appliedAtTick <= w.tick) {
      const { envelope } = this.queue.shift()!;
      // Se revalida contra el estado actual en modo replay: lo ya aceptado siempre se aplica.
      const check = this.commands.check(envelope, w, true);
      if (!check.ok) {
        w.emit('command.failed', { commandId: envelope.id, type: envelope.type, message: check.message });
        continue;
      }
      check.definition.apply(w, check.payload);
      this.log.push({ appliedAtTick: w.tick, envelope });
    }
    for (const system of this.ruleset.systems) system.run(w);
    w.tick++;
  }

  drainEvents(): SimEvent[] {
    return this.world.drainEvents();
  }

  commandLog(): LoggedCommand[] {
    return [...this.log];
  }

  catalog(): CatalogResult {
    return {
      commands: this.commands.describe(),
      criteria: this.world.criteriaRegistry.list(),
      values: { ...this.world.criteria },
    };
  }

  agent(id: number): AgentDetail | null {
    return agentDetail(this.world, id);
  }

  building(id: string): BuildingDetail | null {
    return buildingDetail(this.world, id);
  }

  economy(): EconomySummary {
    return economySummary(this.world);
  }

  mapLogic(): MapLogic[] {
    return this.world.map.logic;
  }

  /** Frame para el render con buffers nuevos (transferibles). */
  frame(): RenderFrame {
    const a = this.world.agents;
    const n = a.count;
    return {
      tick: this.world.tick,
      date: tickToDate(this.world.tick, this.manifest.time),
      agentCount: n,
      agentIds: a.ids.slice(0, n),
      agentPositions: a.positions.slice(0, n * 3),
      agentHeadings: a.headings.slice(0, n),
      agentActivities: a.activities.slice(0, n),
      agentFlags: a.flags.slice(0, n),
      buildingStates: this.world.buildings.state.slice(),
    };
  }

  /**
   * Hash del estado del mundo (ADR-0003). No incluye la cola de comandos pendientes: en un replay esa cola ya contiene
   * comandos futuros que en la ejecución original aún no se habían enviado, y el mundo es idéntico igualmente.
   */
  hash(): number {
    const w = this.world;
    const h = new StateHasher().u32(w.tick);
    for (const s of w.rng.state) h.u32(s);
    for (const key of Object.keys(w.criteria).sort()) {
      const v = w.criteria[key];
      h.str(key);
      if (typeof v === 'number') h.f64(v);
      else h.str(String(v));
    }
    const a = w.agents;
    h.u32(a.count).u32(a.nextId);
    for (const [name, col, stride] of a.eachColumn()) {
      h.str(name);
      for (let k = 0; k < a.count * stride; k++) h.f64(col[k]!);
    }
    const bs = w.buildings;
    for (const [name, col] of bs.eachColumn()) {
      h.str(name);
      for (let k = 0; k < bs.count; k++) h.f64(col[k]!);
    }
    for (let i = 0; i < a.count; i++) {
      h.str(a.names[i]!);
      const p = a.paths[i];
      if (!p) h.u32(0xffffffff);
      else {
        h.u32(p.length);
        for (let k = 0; k < p.length; k++) h.f64(p[k]!);
      }
    }
    return h.digest();
  }

  snapshot(): Snapshot {
    const w = this.world;
    return {
      engineVersion: ENGINE_VERSION,
      tick: w.tick,
      rngState: w.rng.state,
      criteria: { ...w.criteria },
      agents: w.agents.serialize(),
      buildings: w.buildings.serialize(),
      pendingCommands: this.queue.map(({ appliedAtTick, envelope }) => ({ appliedAtTick, envelope })),
      hash: this.hash(),
    };
  }

  private enqueueLogged(entry: LoggedCommand): void {
    this.insert({ seq: this.seq++, appliedAtTick: entry.appliedAtTick, envelope: entry.envelope });
  }

  /** Cola ordenada por (tick, orden de llegada): orden de aplicación determinista. */
  private insert(cmd: QueuedCommand): void {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1]!.appliedAtTick > cmd.appliedAtTick) i--;
    this.queue.splice(i, 0, cmd);
  }
}
