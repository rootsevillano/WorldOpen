import type { LoggedCommand } from './commands';
import type { CriteriaValues } from './criteria';

/** Estado serializado completo del motor en un tick. JSON puro. */
export interface Snapshot {
  engineVersion: string;
  tick: number;
  rngState: [number, number, number, number];
  criteria: CriteriaValues;
  agents: {
    nextId: number;
    count: number;
    /** Columnas numéricas del almacén de agentes (nombre → valores, `count × stride`). */
    columns: Record<string, number[]>;
    names: string[];
    /** Ruta en curso por agente: pares x, z (o `null`). */
    paths: (number[] | null)[];
  };
  /** Comandos aceptados pero programados para un tick futuro (`appliedAtTick` = tick previsto). */
  pendingCommands: LoggedCommand[];
  /** `Simulation.hash()` en este tick, para verificar la restauración. */
  hash: number;
}
