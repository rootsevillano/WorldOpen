import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileWorldStore } from '../../src/fileStore';
import { createSimulation } from '../../src/simulate';
import { runAndSave, verifyWorld } from '../../src/worlds';

describe('Histórico de mundos en ficheros (ADR-0004)', () => {
  it('guarda un mundo con comandos de Dios y su replay coincide con todos los snapshots', async () => {
    const store = new FileWorldStore(join(mkdtempSync(join(tmpdir(), 'worldopen-')), 'worlds'));
    const sim = createSimulation({ seed: 9, agents: 40 });
    const shop = sim.world.map.buildings[sim.world.map.byUse.retail[0]!]!.id;
    const issuer = { userId: 'god', role: 'admin' as const };
    sim.submit({ id: 'f', type: 'disaster.fire', version: 1, issuer, atTick: 600, payload: { buildingId: shop } });
    sim.submit({ id: 'w', type: 'criteria.set', version: 1, issuer, atTick: 2000, payload: { key: 'economy.waterSupply', value: 0 } });
    await runAndSave(store, sim, 3000, true);

    const result = await verifyWorld(store, sim.manifest.worldId);
    expect(result.checked.map((c) => c.tick)).toEqual([1440, 2880, 3000]);
    expect(result.ok).toBe(true);
    expect(await store.readCommands(sim.manifest.worldId)).toHaveLength(2);
  });
});
