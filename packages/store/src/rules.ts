import type { WorldStatus } from '@worldopen/contracts';

/** Transiciones permitidas del ciclo de vida de un mundo (ADR-0004). */
const TRANSITIONS: Record<WorldStatus, WorldStatus[]> = {
  created: ['created', 'running', 'paused', 'ended'],
  running: ['running', 'paused', 'ended'],
  paused: ['paused', 'running', 'ended'],
  ended: ['ended'],
};

export function assertTransition(from: WorldStatus, to: WorldStatus): void {
  if (!TRANSITIONS[from].includes(to)) throw new Error(`Transición de estado no permitida: ${from} → ${to}`);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
