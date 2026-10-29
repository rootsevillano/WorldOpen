import {
  ENGINE_VERSION,
  type CatalogResult,
  type CommandEnvelope,
  type CommandRejectionReason,
  type LoggedCommand,
  type RenderFrame,
  type SimEvent,
  type Snapshot,
  type WorldManifest,
} from '@worldopen/contracts';
import { registerBuiltinCommands } from './commands/builtin';
import { CommandRegistry } from './commands/registry';
import { CriteriaRegistry } from './criteria/registry';
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
}

export type SubmitResult =
  | { ok: true; appliedAtTick: number }
  | { ok: false; reason: CommandRejectionReason; message: string };

interface QueuedCommand {
  seq: number;
  appliedAtTick: number;
  envelope: CommandEnvelope;
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
    );
  }

  /** Restaura un snapshot y, opcionalmente, reprograma los comandos del log posteriores a él. */
  static restore(manifest: WorldManifest, snapshot: Snapshot, log: LoggedCommand[] = [], options: SimulationOptions = {}): Simulation {
    if (snapshot.engineVersion !== ENGINE_VERSION) {
      throw new Error(`Snapshot de la versión ${snapshot.engineVersion}; motor ${ENGINE_VERSION}`);
    }
    const sim = new Simulation(manifest, options);
    const w = sim.world;
    w.tick = snapshot.tick;
    w.rng = new Rng(snapshot.rngState);
    w.criteria = { ...snapshot.criteria };
    const a = snapshot.agents;
    w.agents.count = a.ids.length;
    w.agents.nextId = a.nextId;
    w.agents.ids.set(a.ids);
    w.agents.positions.set(a.positions);
    w.agents.headings.set(a.headings);
    w.agents.activities.set(a.activities);
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
    };
  }

  /** Hash del estado completo (ADR-0003). */
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
    for (let i = 0; i < a.count; i++) {
      h.u32(a.ids[i]!).f64(a.positions[i * 3]!).f64(a.positions[i * 3 + 1]!).f64(a.positions[i * 3 + 2]!);
      h.f64(a.headings[i]!).u32(a.activities[i]!);
    }
    h.u32(this.queue.length);
    for (const q of this.queue) h.u32(q.appliedAtTick).str(q.envelope.id);
    return h.digest();
  }

  snapshot(): Snapshot {
    const w = this.world;
    const a = w.agents;
    const n = a.count;
    return {
      engineVersion: ENGINE_VERSION,
      tick: w.tick,
      rngState: w.rng.state,
      criteria: { ...w.criteria },
      agents: {
        nextId: a.nextId,
        ids: Array.from(a.ids.subarray(0, n)),
        positions: Array.from(a.positions.subarray(0, n * 3)),
        headings: Array.from(a.headings.subarray(0, n)),
        activities: Array.from(a.activities.subarray(0, n)),
      },
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
