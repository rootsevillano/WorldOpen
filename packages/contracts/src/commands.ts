import type { Issuer, Role } from './roles';

/** ADR-0005. Todo cambio externo del mundo llega como un comando serializable. */
export interface CommandEnvelope<P = unknown> {
  /** Único por emisor; lo genera el host. */
  id: string;
  /** `dominio.accion`, p. ej. `criteria.set`. */
  type: string;
  version: number;
  issuer: Issuer;
  /** Tick en que debe aplicarse. Si falta o ya pasó, se aplica en el siguiente tick. */
  atTick?: number;
  payload: P;
}

export type CommandStatus = 'active' | 'deprecated' | 'removed';

/** Descripción serializable de un comando, publicada a la UI (herramienta de Dios). */
export interface CommandDescriptor {
  type: string;
  version: number;
  status: CommandStatus;
  authority: Role[];
  description: string;
}

export type CommandRejectionReason =
  | 'unknown_command'
  | 'removed_command'
  | 'unauthorized'
  | 'invalid_payload'
  /** Mundo terminado u observador: no admite cambios. */
  | 'read_only';

/** Comando aceptado tal y como queda en el log del mundo (ADR-0004). */
export interface LoggedCommand {
  appliedAtTick: number;
  envelope: CommandEnvelope;
}
