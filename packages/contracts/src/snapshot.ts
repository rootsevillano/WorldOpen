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
    /** Siguiente id de hogar. */
    nextHousehold: number;
    count: number;
    /** Columnas numéricas del almacén de agentes (nombre → valores, `count × stride`). */
    columns: Record<string, number[]>;
    names: string[];
    /** Ruta en curso por agente: pares x, z (o `null`). */
    paths: (number[] | null)[];
  };
  /** Perros y ganado (ADR-0027): columnas como las de los agentes. */
  animals: { nextId: number; count: number; columns: Record<string, number[]> };
  /** Estado dinámico de los edificios (existencias, incendios…), columnas por índice de edificio. */
  buildings: { columns: Record<string, number[]> };
  /** Comandos aceptados pero programados para un tick futuro (`appliedAtTick` = tick previsto). */
  pendingCommands: LoggedCommand[];
  /** `Simulation.hash()` en este tick, para verificar la restauración. */
  hash: number;
}
