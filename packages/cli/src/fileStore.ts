import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LoggedCommand, Snapshot, WorldManifest, WorldStatus, WorldStore, WorldSummary } from '@worldopen/contracts';
import { assertTransition } from '@worldopen/store/rules';

/**
 * WorldStore en ficheros (CLI). Una carpeta por mundo:
 * `manifest.json`, `summary.json`, `commands.jsonl` (append-only) y `snapshots/<tick>.json`.
 */
export class FileWorldStore implements WorldStore {
  constructor(private readonly root: string) {}

  private dir(worldId: string): string {
    if (!/^[\w-]+$/.test(worldId)) throw new Error(`worldId inválido: ${worldId}`);
    return join(this.root, worldId);
  }

  private async readJson<T>(path: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private async summary(worldId: string): Promise<WorldSummary> {
    const s = await this.readJson<WorldSummary>(join(this.dir(worldId), 'summary.json'));
    if (!s) throw new Error(`No existe el mundo ${worldId}`);
    return s;
  }

  private async writable(worldId: string): Promise<WorldSummary> {
    const s = await this.summary(worldId);
    if (s.status === 'ended') throw new Error(`El mundo ${worldId} ha terminado: es de solo lectura`);
    return s;
  }

  async listWorlds(): Promise<WorldSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const out: WorldSummary[] = [];
    for (const n of names) {
      const s = await this.readJson<WorldSummary>(join(this.root, n, 'summary.json'));
      if (s) out.push(s);
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async createWorld(manifest: WorldManifest): Promise<void> {
    const dir = this.dir(manifest.worldId);
    if (await this.readJson(join(dir, 'summary.json'))) throw new Error(`El mundo ${manifest.worldId} ya existe`);
    await mkdir(join(dir, 'snapshots'), { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(dir, 'commands.jsonl'), '');
    const summary: WorldSummary = { worldId: manifest.worldId, name: manifest.name, status: 'created', createdAt: manifest.createdAt, lastTick: 0 };
    await writeFile(join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  }

  async getManifest(worldId: string): Promise<WorldManifest | null> {
    return this.readJson<WorldManifest>(join(this.dir(worldId), 'manifest.json'));
  }

  async setStatus(worldId: string, status: WorldStatus, lastTick: number): Promise<void> {
    const s = await this.summary(worldId);
    assertTransition(s.status, status);
    s.status = status;
    s.lastTick = Math.max(s.lastTick, lastTick);
    await writeFile(join(this.dir(worldId), 'summary.json'), JSON.stringify(s, null, 2) + '\n');
  }

  async appendCommands(worldId: string, commands: LoggedCommand[]): Promise<void> {
    await this.writable(worldId);
    if (commands.length === 0) return;
    await appendFile(join(this.dir(worldId), 'commands.jsonl'), commands.map((c) => JSON.stringify(c)).join('\n') + '\n');
  }

  async readCommands(worldId: string, fromTick = 0): Promise<LoggedCommand[]> {
    await this.summary(worldId);
    const text = await readFile(join(this.dir(worldId), 'commands.jsonl'), 'utf8');
    return text
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as LoggedCommand)
      .filter((c) => c.appliedAtTick >= fromTick);
  }

  async putSnapshot(worldId: string, snapshot: Snapshot): Promise<void> {
    const s = await this.writable(worldId);
    await writeFile(join(this.dir(worldId), 'snapshots', `${String(snapshot.tick).padStart(10, '0')}.json`), JSON.stringify(snapshot));
    s.lastTick = Math.max(s.lastTick, snapshot.tick);
    await writeFile(join(this.dir(worldId), 'summary.json'), JSON.stringify(s, null, 2) + '\n');
  }

  async listSnapshots(worldId: string): Promise<{ tick: number; hash: number }[]> {
    await this.summary(worldId);
    const files = (await readdir(join(this.dir(worldId), 'snapshots'))).filter((f) => f.endsWith('.json')).sort();
    const out: { tick: number; hash: number }[] = [];
    for (const f of files) {
      const s = await this.readJson<Snapshot>(join(this.dir(worldId), 'snapshots', f));
      if (s) out.push({ tick: s.tick, hash: s.hash });
    }
    return out;
  }

  async getSnapshot(worldId: string, atTick?: number): Promise<Snapshot | null> {
    await this.summary(worldId);
    const files = (await readdir(join(this.dir(worldId), 'snapshots'))).filter((f) => f.endsWith('.json')).sort();
    const ticks = files.map((f) => Number(f.slice(0, -5))).filter((t) => atTick === undefined || t <= atTick);
    const last = ticks[ticks.length - 1];
    if (last === undefined) return null;
    return this.readJson<Snapshot>(join(this.dir(worldId), 'snapshots', `${String(last).padStart(10, '0')}.json`));
  }
}
