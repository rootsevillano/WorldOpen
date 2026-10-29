import type { LoggedCommand, Snapshot, WorldManifest, WorldStatus, WorldStore, WorldSummary } from '@worldopen/contracts';
import { assertTransition, clone } from './rules';

interface Entry {
  manifest: WorldManifest;
  summary: WorldSummary;
  commands: LoggedCommand[];
  snapshots: Snapshot[];
}

/** WorldStore en memoria: tests y hosts efímeros. Copia todo lo que entra y sale (sin referencias compartidas). */
export class MemoryWorldStore implements WorldStore {
  private readonly worlds = new Map<string, Entry>();

  async listWorlds(): Promise<WorldSummary[]> {
    return [...this.worlds.values()].map((e) => clone(e.summary)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async createWorld(manifest: WorldManifest): Promise<void> {
    if (this.worlds.has(manifest.worldId)) throw new Error(`El mundo ${manifest.worldId} ya existe`);
    this.worlds.set(manifest.worldId, {
      manifest: clone(manifest),
      summary: { worldId: manifest.worldId, name: manifest.name, status: 'created', createdAt: manifest.createdAt, lastTick: 0 },
      commands: [],
      snapshots: [],
    });
  }

  async getManifest(worldId: string): Promise<WorldManifest | null> {
    const e = this.worlds.get(worldId);
    return e ? clone(e.manifest) : null;
  }

  async setStatus(worldId: string, status: WorldStatus, lastTick: number): Promise<void> {
    const e = this.get(worldId);
    assertTransition(e.summary.status, status);
    e.summary.status = status;
    e.summary.lastTick = Math.max(e.summary.lastTick, lastTick);
  }

  async appendCommands(worldId: string, commands: LoggedCommand[]): Promise<void> {
    const e = this.writable(worldId);
    e.commands.push(...clone(commands));
  }

  async readCommands(worldId: string, fromTick = 0): Promise<LoggedCommand[]> {
    return clone(this.get(worldId).commands.filter((c) => c.appliedAtTick >= fromTick));
  }

  async putSnapshot(worldId: string, snapshot: Snapshot): Promise<void> {
    const e = this.writable(worldId);
    e.snapshots = e.snapshots.filter((s) => s.tick !== snapshot.tick);
    e.snapshots.push(clone(snapshot));
    e.snapshots.sort((a, b) => a.tick - b.tick);
    e.summary.lastTick = Math.max(e.summary.lastTick, snapshot.tick);
  }

  async getSnapshot(worldId: string, atTick?: number): Promise<Snapshot | null> {
    const list = this.get(worldId).snapshots.filter((s) => atTick === undefined || s.tick <= atTick);
    const last = list[list.length - 1];
    return last ? clone(last) : null;
  }

  private get(worldId: string): Entry {
    const e = this.worlds.get(worldId);
    if (!e) throw new Error(`No existe el mundo ${worldId}`);
    return e;
  }

  private writable(worldId: string): Entry {
    const e = this.get(worldId);
    if (e.summary.status === 'ended') throw new Error(`El mundo ${worldId} ha terminado: es de solo lectura`);
    return e;
  }
}
