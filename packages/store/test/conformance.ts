import type { Snapshot, WorldManifest, WorldStore } from '@worldopen/contracts';
import { describe, expect, it } from 'vitest';

/** Batería común que todo adaptador de `WorldStore` debe superar (CONTRACTS/world-store.md). */
export function worldStoreConformance(name: string, make: () => Promise<WorldStore> | WorldStore): void {
  const manifest = (id: string, createdAt = '2026-01-01T00:00:00Z'): WorldManifest => ({
    worldId: id, name: `Mundo ${id}`, createdAt, engineVersion: 'test', seed: 1,
    time: { minutesPerTick: 1, start: { year: 1, month: 3, day: 21, hour: 6, minute: 0 } },
    ruleset: 'contemporary', regions: [], criteria: {},
  });
  const snapshot = (tick: number): Snapshot => ({
    engineVersion: 'test', tick, rngState: [1, 2, 3, 4], criteria: { k: tick },
    agents: { nextId: 1, count: 0, columns: {}, names: [], paths: [] },
    buildings: { columns: {} }, pendingCommands: [], hash: tick,
  });
  const cmd = (tick: number, id: string) => ({
    appliedAtTick: tick,
    envelope: { id, type: 'criteria.set', version: 1, issuer: { userId: 'u', role: 'admin' as const }, payload: { key: 'k', value: tick } },
  });

  describe(`WorldStore · ${name}`, () => {
    it('crea, lista (más reciente primero) y devuelve el manifiesto', async () => {
      const s = await make();
      await s.createWorld(manifest('a', '2026-01-01T00:00:00Z'));
      await s.createWorld(manifest('b', '2026-02-01T00:00:00Z'));
      await expect(s.createWorld(manifest('a'))).rejects.toThrow();
      expect((await s.listWorlds()).map((w) => w.worldId)).toEqual(['b', 'a']);
      expect(await s.getManifest('a')).toEqual(manifest('a', '2026-01-01T00:00:00Z'));
      expect(await s.getManifest('zz')).toBeNull();
    });

    it('log append-only en orden y filtrado por tick', async () => {
      const s = await make();
      await s.createWorld(manifest('w'));
      await s.appendCommands('w', [cmd(5, 'x'), cmd(10, 'y')]);
      await s.appendCommands('w', [cmd(10, 'z')]);
      expect((await s.readCommands('w')).map((c) => c.envelope.id)).toEqual(['x', 'y', 'z']);
      expect((await s.readCommands('w', 10)).map((c) => c.envelope.id)).toEqual(['y', 'z']);
    });

    it('snapshots: el más reciente con tick ≤ atTick', async () => {
      const s = await make();
      await s.createWorld(manifest('w'));
      expect(await s.getSnapshot('w')).toBeNull();
      for (const t of [0, 1440, 2880]) await s.putSnapshot('w', snapshot(t));
      expect((await s.getSnapshot('w'))!.tick).toBe(2880);
      expect((await s.getSnapshot('w', 2000))!.tick).toBe(1440);
      expect((await s.getSnapshot('w', 0))!.tick).toBe(0);
      expect((await s.listWorlds())[0]!.lastTick).toBe(2880);
    });

    it('ciclo de vida: un mundo terminado es de solo lectura', async () => {
      const s = await make();
      await s.createWorld(manifest('w'));
      await s.setStatus('w', 'running', 10);
      await s.setStatus('w', 'paused', 20);
      await s.setStatus('w', 'ended', 30);
      expect((await s.listWorlds())[0]).toMatchObject({ status: 'ended', lastTick: 30 });
      await expect(s.setStatus('w', 'running', 40)).rejects.toThrow();
      await expect(s.appendCommands('w', [cmd(1, 'q')])).rejects.toThrow();
      await expect(s.putSnapshot('w', snapshot(50))).rejects.toThrow();
      expect(await s.readCommands('w')).toEqual([]);
    });

    it('mundos aislados entre sí', async () => {
      const s = await make();
      await s.createWorld(manifest('a'));
      await s.createWorld(manifest('b'));
      await s.appendCommands('a', [cmd(1, 'only-a')]);
      await s.putSnapshot('a', snapshot(7));
      expect(await s.readCommands('b')).toEqual([]);
      expect(await s.getSnapshot('b')).toBeNull();
    });
  });
}
