import type {
  CommandDescriptor,
  CommandEnvelope,
  CommandRejectionReason,
  CommandStatus,
  Role,
} from '@worldopen/contracts';
import type { World } from '../world/world';

/** ADR-0005. Definición de un comando registrable. */
export interface CommandDefinition<P = unknown> {
  type: string;
  version: number;
  status: CommandStatus;
  authority: Role[];
  description: string;
  /** Devuelve el payload tipado o un mensaje de error. No debe mutar nada. */
  validate(payload: unknown, world: World, issuerRole: Role): { ok: true; payload: P } | { ok: false; message: string };
  /** Aplica el comando al inicio de un tick. Determinista. */
  apply(world: World, payload: P): void;
}

export type CommandCheck =
  | { ok: true; definition: CommandDefinition; payload: unknown }
  | { ok: false; reason: CommandRejectionReason; message: string };

const key = (type: string, version: number) => `${type}@${version}`;

export class CommandRegistry {
  private readonly defs = new Map<string, CommandDefinition>();

  register<P>(def: CommandDefinition<P>): void {
    const k = key(def.type, def.version);
    if (this.defs.has(k)) throw new Error(`Comando duplicado: ${k}`);
    // Copia: `setStatus` no debe alterar definiciones compartidas entre simulaciones.
    this.defs.set(k, { ...def } as CommandDefinition);
  }

  /** Cambia el estado de un comando ya registrado (alta/baja sin borrar código, ADR-0005). */
  setStatus(type: string, version: number, status: CommandStatus): void {
    const def = this.defs.get(key(type, version));
    if (!def) throw new Error(`Comando no registrado: ${key(type, version)}`);
    def.status = status;
  }

  describe(): CommandDescriptor[] {
    return [...this.defs.values()]
      .map(({ type, version, status, authority, description }) => ({
        type, version, status, authority: [...authority], description,
      }))
      .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.version - b.version));
  }

  /**
   * Comprueba un comando. `replay = true` cuando procede de un log ya aceptado: entonces los comandos
   * `removed` se siguen aplicando y no se revalida la autoridad.
   */
  check(envelope: CommandEnvelope, world: World, replay = false): CommandCheck {
    const def = this.defs.get(key(envelope.type, envelope.version));
    if (!def) {
      return { ok: false, reason: 'unknown_command', message: `Comando desconocido: ${key(envelope.type, envelope.version)}` };
    }
    if (!replay) {
      if (def.status === 'removed') {
        return { ok: false, reason: 'removed_command', message: `Comando retirado: ${key(def.type, def.version)}` };
      }
      if (!def.authority.includes(envelope.issuer.role)) {
        return { ok: false, reason: 'unauthorized', message: `El rol ${envelope.issuer.role} no puede emitir ${def.type}` };
      }
    }
    const result = def.validate(envelope.payload, world, replay ? 'admin' : envelope.issuer.role);
    if (!result.ok) return { ok: false, reason: 'invalid_payload', message: result.message };
    return { ok: true, definition: def, payload: result.payload };
  }
}
