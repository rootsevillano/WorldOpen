import type { CommandEnvelope, Role } from '@worldopen/contracts';
import { createManifest } from '../src';

export const manifest = (seed = 42, extra: Parameters<typeof createManifest>[0] extends infer T ? Partial<T> : never = {}) =>
  createManifest({ worldId: 'test-world', createdAt: '2026-01-01T00:00:00Z', seed, ...extra });

let n = 0;
export function setCriterion(key: string, value: unknown, role: Role = 'admin', atTick?: number): CommandEnvelope {
  return {
    id: `cmd-${n++}`,
    type: 'criteria.set',
    version: 1,
    issuer: { userId: role === 'admin' ? 'god' : 'guest', role },
    ...(atTick === undefined ? {} : { atTick }),
    payload: { key, value },
  };
}
