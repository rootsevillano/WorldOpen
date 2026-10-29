import type { LoggedCommand, Snapshot, WorldManifest, WorldStatus, WorldStore, WorldSummary } from '@worldopen/contracts';
import { assertTransition } from './rules';

const DB_VERSION = 1;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}

/**
 * WorldStore sobre IndexedDB (navegador y Web Worker). Almacenes:
 * `worlds` (clave `worldId`: manifiesto + resumen), `commands` (autoincremental, índice `worldId`) y
 * `snapshots` (clave `[worldId, tick]`).
 */
export class IndexedDbWorldStore implements WorldStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName = 'worldopen',
    private readonly idb: IDBFactory = indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.idb.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('worlds', { keyPath: 'worldId' });
        const commands = db.createObjectStore('commands', { autoIncrement: true });
        commands.createIndex('worldId', 'worldId');
        db.createObjectStore('snapshots', { keyPath: ['worldId', 'tick'] });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  async listWorlds(): Promise<WorldSummary[]> {
    const db = await this.open();
    const rows = (await promisify(db.transaction('worlds').objectStore('worlds').getAll())) as { summary: WorldSummary }[];
    return rows.map((r) => r.summary).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async createWorld(manifest: WorldManifest): Promise<void> {
    const db = await this.open();
    const tx = db.transaction('worlds', 'readwrite');
    const summary: WorldSummary = { worldId: manifest.worldId, name: manifest.name, status: 'created', createdAt: manifest.createdAt, lastTick: 0 };
    tx.objectStore('worlds').add({ worldId: manifest.worldId, manifest, summary });
    await done(tx);
  }

  async getManifest(worldId: string): Promise<WorldManifest | null> {
    const row = await this.row(worldId);
    return row?.manifest ?? null;
  }

  async setStatus(worldId: string, status: WorldStatus, lastTick: number): Promise<void> {
    const db = await this.open();
    const tx = db.transaction('worlds', 'readwrite');
    const store = tx.objectStore('worlds');
    const row = (await promisify(store.get(worldId))) as { summary: WorldSummary } | undefined;
    if (!row) throw new Error(`No existe el mundo ${worldId}`);
    assertTransition(row.summary.status, status);
    row.summary.status = status;
    row.summary.lastTick = Math.max(row.summary.lastTick, lastTick);
    store.put(row);
    await done(tx);
  }

  async appendCommands(worldId: string, commands: LoggedCommand[]): Promise<void> {
    await this.writable(worldId);
    const db = await this.open();
    const tx = db.transaction('commands', 'readwrite');
    const store = tx.objectStore('commands');
    for (const c of commands) store.add({ worldId, ...c });
    await done(tx);
  }

  async readCommands(worldId: string, fromTick = 0): Promise<LoggedCommand[]> {
    if (!(await this.row(worldId))) throw new Error(`No existe el mundo ${worldId}`);
    const db = await this.open();
    const rows = (await promisify(db.transaction('commands').objectStore('commands').index('worldId').getAll(worldId))) as (LoggedCommand & { worldId: string })[];
    // getAll por índice devuelve en orden de clave primaria (orden de inserción): el orden del log.
    return rows.filter((r) => r.appliedAtTick >= fromTick).map(({ appliedAtTick, envelope }) => ({ appliedAtTick, envelope }));
  }

  async putSnapshot(worldId: string, snapshot: Snapshot): Promise<void> {
    await this.writable(worldId);
    const db = await this.open();
    const tx = db.transaction(['snapshots', 'worlds'], 'readwrite');
    tx.objectStore('snapshots').put({ worldId, ...snapshot });
    const worlds = tx.objectStore('worlds');
    const row = (await promisify(worlds.get(worldId))) as { summary: WorldSummary };
    row.summary.lastTick = Math.max(row.summary.lastTick, snapshot.tick);
    worlds.put(row);
    await done(tx);
  }

  async getSnapshot(worldId: string, atTick?: number): Promise<Snapshot | null> {
    if (!(await this.row(worldId))) throw new Error(`No existe el mundo ${worldId}`);
    const db = await this.open();
    const upper = atTick ?? Number.MAX_SAFE_INTEGER;
    const range = IDBKeyRange.bound([worldId, 0], [worldId, upper]);
    const cursor = await promisify(db.transaction('snapshots').objectStore('snapshots').openCursor(range, 'prev'));
    if (!cursor) return null;
    const { worldId: _w, ...snapshot } = cursor.value as Snapshot & { worldId: string };
    return snapshot;
  }

  private async row(worldId: string): Promise<{ manifest: WorldManifest; summary: WorldSummary } | undefined> {
    const db = await this.open();
    return (await promisify(db.transaction('worlds').objectStore('worlds').get(worldId))) as
      | { manifest: WorldManifest; summary: WorldSummary }
      | undefined;
  }

  private async writable(worldId: string): Promise<void> {
    const row = await this.row(worldId);
    if (!row) throw new Error(`No existe el mundo ${worldId}`);
    if (row.summary.status === 'ended') throw new Error(`El mundo ${worldId} ha terminado: es de solo lectura`);
  }
}
