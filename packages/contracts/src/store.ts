import type { LoggedCommand } from './commands';
import type { WorldManifest } from './manifest';
import type { Snapshot } from './snapshot';

/** ADR-0004. Ciclo de vida de un mundo guardado. */
export type WorldStatus = 'created' | 'running' | 'paused' | 'ended';

export interface WorldSummary {
  worldId: string;
  name: string;
  status: WorldStatus;
  createdAt: string;
  lastTick: number;
}

/**
 * Persistencia del histórico de mundos. Adaptadores: IndexedDB (navegador), ficheros (CLI) y, en la fase
 * servidor, una base de datos. El log es append-only; un mundo `ended` es de solo lectura.
 */
export interface WorldStore {
  listWorlds(): Promise<WorldSummary[]>;
  createWorld(manifest: WorldManifest): Promise<void>;
  getManifest(worldId: string): Promise<WorldManifest | null>;
  setStatus(worldId: string, status: WorldStatus, lastTick: number): Promise<void>;
  appendCommands(worldId: string, commands: LoggedCommand[]): Promise<void>;
  readCommands(worldId: string, fromTick?: number): Promise<LoggedCommand[]>;
  putSnapshot(worldId: string, snapshot: Snapshot): Promise<void>;
  /** Ticks y hashes de todos los snapshots, en orden (línea de tiempo y verificación del visor de estudio). */
  listSnapshots(worldId: string): Promise<{ tick: number; hash: number }[]>;
  /** Snapshot más reciente con `tick <= atTick` (o el último si falta `atTick`). */
  getSnapshot(worldId: string, atTick?: number): Promise<Snapshot | null>;
}
