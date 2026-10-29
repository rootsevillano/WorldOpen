import type { CommandDescriptor, CommandEnvelope, CommandRejectionReason, LoggedCommand } from './commands';
import type { CriteriaValues, CriterionDefinition } from './criteria';
import type { SimEvent } from './events';
import type { RenderFrame } from './frame';
import type { WorldManifest } from './manifest';
import type { Snapshot } from './snapshot';
import type { GameDate } from './time';

/**
 * Simulation API (ADR-0002). Mensajes entre el host de UI y el host del motor (Worker hoy, servidor mañana).
 * Todos son serializables con structured clone.
 */
export type HostToEngine =
  | { type: 'init'; protocol: number; manifest: WorldManifest; snapshot?: Snapshot; log?: LoggedCommand[] }
  | { type: 'control'; action: 'play' | 'pause' }
  | { type: 'control'; action: 'setSpeed'; ticksPerSecond: number | 'max' }
  | { type: 'step'; ticks: number }
  | { type: 'command'; envelope: CommandEnvelope }
  | { type: 'query'; requestId: string; query: EngineQuery };

export type EngineQuery = { kind: 'catalog' } | { kind: 'snapshot' } | { kind: 'log' };

export interface CatalogResult {
  commands: CommandDescriptor[];
  criteria: CriterionDefinition[];
  values: CriteriaValues;
}

export interface QueryResultMap {
  catalog: CatalogResult;
  snapshot: Snapshot;
  log: LoggedCommand[];
}

export interface EngineStatus {
  running: boolean;
  ticksPerSecond: number | 'max';
  /** Ticks por segundo reales medidos en el último segundo. */
  measuredTps: number;
  tick: number;
  date: GameDate;
}

export type EngineToHost =
  | { type: 'ready'; protocol: number; engineVersion: string; worldId: string; tick: number }
  | { type: 'frame'; frame: RenderFrame }
  | { type: 'status'; status: EngineStatus }
  | { type: 'events'; events: SimEvent[] }
  | { type: 'commandAccepted'; commandId: string; appliedAtTick: number }
  | { type: 'commandRejected'; commandId: string; reason: CommandRejectionReason; message: string }
  | { type: 'queryResult'; requestId: string; kind: EngineQuery['kind']; result: QueryResultMap[EngineQuery['kind']] }
  | { type: 'error'; message: string };
