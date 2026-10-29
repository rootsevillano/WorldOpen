import type { LoggedCommand } from './commands';
import type { TimeConfig } from './time';

/** Visor de estudio (T5, ADR-0015): todo lo necesario para dibujar la línea de tiempo de un mundo guardado. */
export interface Timeline {
  worldId: string;
  name: string;
  time: TimeConfig;
  startTick: number;
  /** Último tick grabado: el replay no puede ir más allá. */
  endTick: number;
  snapshots: { tick: number; hash: number }[];
  /** Intervenciones de Dios en orden: marcadores de la línea de tiempo. */
  commands: LoggedCommand[];
}

/** Series de métricas muestreadas cada `everyTicks` durante el análisis completo del mundo. */
export interface SeriesChunk {
  /** Ticks de las muestras de este fragmento. */
  ticks: number[];
  /** Métrica → valores alineados con `ticks`. */
  values: Record<string, number[]>;
}

/** Resultado de comprobar el replay contra los hashes de los snapshots guardados (ADR-0003). */
export interface Verification {
  checked: number;
  failed: number[];
  total: number;
}

export interface AnalysisProgress {
  /** 0–1. */
  progress: number;
  done: boolean;
  verification: Verification;
}

/** Métricas que calcula por defecto el visor (ver `engine/src/metrics.ts`). */
export const STUDY_METRICS = [
  'agents.atHomeRatio',
  'agents.workingRatio',
  'agents.leisureRatio',
  'agents.outdoorsRatio',
  'agents.queueingRatio',
  'agents.sleepingRatio',
  'agents.avgHunger',
  'agents.avgThirst',
  'agents.avgHealth',
  'agents.avgSocial',
  'economy.shopFood',
  'economy.pantryWater',
  'env.temperatureC',
  'agents.count',
] as const;
