import type { CommandDescriptor, CommandEnvelope, CommandRejectionReason, LoggedCommand } from './commands';
import type { CriteriaValues, CriterionDefinition } from './criteria';
import type { SimEvent } from './events';
import type { RenderFrame } from './frame';
import type { AgentDetail, BuildingDetail, EconomySummary } from './inspect';
import type { WorldManifest } from './manifest';
import type { MapLogic } from './mappack';
import type { Snapshot } from './snapshot';
import type { AnalysisProgress, SeriesChunk, Timeline } from './study';
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
  /** Abre un mundo guardado en el visor de estudio: replay de solo lectura hasta el último tick grabado. */
  | { type: 'replay'; protocol: number; worldId: string }
  /** Solo en replay: salta a un tick (restaura el snapshot anterior y avanza). */
  | { type: 'seek'; tick: number }
  /** Solo en replay: reproduce el mundo completo en segundo plano y publica series de métricas (`series`). */
  | { type: 'analyze'; everyTicks: number; metrics: string[] }
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
  | { kind: 'economy' }
  | { kind: 'timeline' };

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
  timeline: Timeline | null;
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
  /** `live`: mundo en marcha; `replay`: visor de estudio. */
  mode: 'live' | 'replay';
  /** En replay, último tick reproducible. */
  endTick: number | null;
}

export type EngineToHost =
  | { type: 'ready'; protocol: number; engineVersion: string; worldId: string; tick: number; manifest: WorldManifest }
  | { type: 'frame'; frame: RenderFrame }
  | { type: 'status'; status: EngineStatus }
  | { type: 'events'; events: SimEvent[] }
  | { type: 'commandAccepted'; commandId: string; appliedAtTick: number }
  | { type: 'commandRejected'; commandId: string; reason: CommandRejectionReason; message: string }
  | { type: 'queryResult'; requestId: string; kind: EngineQuery['kind']; result: QueryResultMap[EngineQuery['kind']] }
  | { type: 'series'; chunk: SeriesChunk; analysis: AnalysisProgress }
  | { type: 'error'; message: string };
