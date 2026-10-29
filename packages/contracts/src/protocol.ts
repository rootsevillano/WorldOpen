import type { CommandDescriptor, CommandEnvelope, CommandRejectionReason, LoggedCommand } from './commands';
import type { CriteriaValues, CriterionDefinition } from './criteria';
import type { SimEvent } from './events';
import type { RenderFrame } from './frame';
import type { AgentDetail, BuildingDetail, EconomySummary } from './inspect';
import type { WorldManifest } from './manifest';
import type { MapLogic } from './mappack';
import type { Snapshot } from './snapshot';
import type { WorldStatus } from './store';
import type { GameDate } from './time';

/**
 * Simulation API (ADR-0002). Mensajes entre el host de UI y el host del motor (Worker hoy, servidor mañana).
 * Todos son serializables con structured clone.
 */
export type HostToEngine =
  /** Mundo nuevo. Si el host tiene `WorldStore`, lo registra y lo va guardando. */
  | { type: 'init'; protocol: number; manifest: WorldManifest; snapshot?: Snapshot; log?: LoggedCommand[] }
  /** Abre un mundo guardado (último snapshot + log). Un mundo `ended` se abre en solo lectura. */
  | { type: 'load'; protocol: number; worldId: string }
  /** Termina el mundo: último snapshot, estado `ended`, solo lectura. */
  | { type: 'end' }
  | { type: 'control'; action: 'play' | 'pause' }
  | { type: 'control'; action: 'setSpeed'; ticksPerSecond: number | 'max' }
  | { type: 'step'; ticks: number }
  | { type: 'command'; envelope: CommandEnvelope }
  | { type: 'query'; requestId: string; query: EngineQuery };

export type EngineQuery =
  | { kind: 'catalog' }
  | { kind: 'snapshot' }
  | { kind: 'log' }
  | { kind: 'map' }
  | { kind: 'agent'; agentId: number }
  | { kind: 'building'; buildingId: string }
  | { kind: 'economy' };

export interface CatalogResult {
  commands: CommandDescriptor[];
  criteria: CriterionDefinition[];
  values: CriteriaValues;
}

export interface QueryResultMap {
  catalog: CatalogResult;
  snapshot: Snapshot;
  log: LoggedCommand[];
  /** Mapas lógicos de todas las regiones (el render los usa si la región no trae GLB). */
  map: MapLogic[];
  agent: AgentDetail | null;
  building: BuildingDetail | null;
  economy: EconomySummary;
}

export interface EngineStatus {
  running: boolean;
  ticksPerSecond: number | 'max';
  /** Ticks por segundo reales medidos en el último segundo. */
  measuredTps: number;
  tick: number;
  date: GameDate;
  worldId: string;
  worldStatus: WorldStatus;
  /** Mundo terminado o abierto como observador: no acepta comandos. */
  readOnly: boolean;
  /** Último tick guardado en el `WorldStore` (−1 si no hay persistencia). */
  savedTick: number;
}

export type EngineToHost =
  | { type: 'ready'; protocol: number; engineVersion: string; worldId: string; tick: number; manifest: WorldManifest }
  | { type: 'frame'; frame: RenderFrame }
  | { type: 'status'; status: EngineStatus }
  | { type: 'events'; events: SimEvent[] }
  | { type: 'commandAccepted'; commandId: string; appliedAtTick: number }
  | { type: 'commandRejected'; commandId: string; reason: CommandRejectionReason; message: string }
  | { type: 'queryResult'; requestId: string; kind: EngineQuery['kind']; result: QueryResultMap[EngineQuery['kind']] }
  | { type: 'error'; message: string };
