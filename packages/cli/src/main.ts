import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runScenarioDir } from './behavior';
import { FileWorldStore } from './fileStore';
import { REPORT_METRICS, metric } from './metrics';
import { createSimulation, simulate } from './simulate';
import { DEFAULT_WORLDS_DIR, runAndSave, verifyWorld } from './worlds';

const USAGE = `worldopen — motor de simulación WorldOpen (headless)

Uso:
  worldopen simulate --ticks <n> [--seed <n>] [--agents <n>] [--minutes-per-tick <n>] [--out <report.json>] [--max-ms <n>]
                     [--save [--name <nombre>] [--end]] [--worlds <dir>]
  worldopen worlds [--worlds <dir>]                 Lista los mundos guardados
  worldopen verify <worldId> [--worlds <dir>]       Reproduce un mundo y comprueba sus snapshots
  worldopen gate behavior <directorio de escenarios>
`;

async function main(argv: string[]): Promise<number> {
  const [cmd, sub, ...rest] = argv;

  if (cmd === 'simulate') {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: {
        ticks: { type: 'string', default: '1440' },
        seed: { type: 'string', default: '1' },
        agents: { type: 'string' },
        'max-ms': { type: 'string' },
        'minutes-per-tick': { type: 'string' },
        out: { type: 'string' },
        save: { type: 'boolean', default: false },
        end: { type: 'boolean', default: false },
        name: { type: 'string' },
        worlds: { type: 'string', default: DEFAULT_WORLDS_DIR },
      },
    });
    const opts = {
      seed: Number(values.seed),
      ticks: Number(values.ticks),
      ...(values['minutes-per-tick'] ? { minutesPerTick: Number(values['minutes-per-tick']) } : {}),
      ...(values.agents ? { agents: Number(values.agents) } : {}),
      ...(values.name ? { manifest: { name: values.name } } : {}),
    };
    if (values.save) {
      const sim = createSimulation(opts);
      const t0 = performance.now();
      await runAndSave(new FileWorldStore(values.worlds), sim, opts.ticks, values.end);
      const report = {
        worldId: sim.manifest.worldId,
        savedTo: values.worlds,
        ticks: sim.tick,
        hash: sim.hash().toString(16).padStart(8, '0'),
        metrics: Object.fromEntries(REPORT_METRICS.map((m) => [m, metric(sim, m)])),
        elapsedMs: Math.round(performance.now() - t0),
      };
      console.log(JSON.stringify(report, null, 2));
      return 0;
    }
    const { report } = simulate(opts);
    const json = JSON.stringify(report, null, 2);
    if (values.out) writeFileSync(values.out, json + '\n');
    console.log(json);
    // Gate de rendimiento (P3): falla si la simulación tarda más de --max-ms.
    if (values['max-ms'] && report.elapsedMs > Number(values['max-ms'])) {
      console.error(`Rendimiento: ${report.elapsedMs} ms > ${values['max-ms']} ms`);
      return 1;
    }
    return 0;
  }

  if (cmd === 'worlds' || cmd === 'verify') {
    const { values, positionals } = parseArgs({
      args: argv.slice(1),
      allowPositionals: true,
      options: { worlds: { type: 'string', default: DEFAULT_WORLDS_DIR } },
    });
    const store = new FileWorldStore(values.worlds);
    if (cmd === 'worlds') {
      for (const w of await store.listWorlds()) console.log(`${w.worldId}  ${w.status.padEnd(7)}  tick ${w.lastTick}  ${w.createdAt}  ${w.name}`);
      return 0;
    }
    const id = positionals[0];
    if (!id) {
      console.error(USAGE);
      return 2;
    }
    const result = await verifyWorld(store, id);
    for (const c of result.checked) console.log(`${c.ok ? '✓' : '✗'} tick ${c.tick}`);
    console.log(result.ok ? `Mundo ${id}: replay idéntico` : `Mundo ${id}: el replay NO coincide`);
    return result.ok ? 0 : 1;
  }

  if (cmd === 'gate' && sub === 'behavior') {
    const dir = rest[0];
    if (!dir) {
      console.error(USAGE);
      return 2;
    }
    const results = runScenarioDir(dir);
    if (results.length === 0) {
      console.error(`No hay escenarios *.scenario.json en ${dir}`);
      return 1;
    }
    for (const r of results) {
      console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ticksPerSeed} ticks/seed, ${r.elapsedMs} ms)`);
      for (const a of r.results) console.log(`   ${a.passed ? '✓' : '✗'} ${a.detail}`);
    }
    const failed = results.filter((r) => !r.passed).length;
    console.log(`\nBehavior Gate: ${results.length - failed}/${results.length} escenarios superados`);
    return failed === 0 ? 0 : 1;
  }

  console.error(USAGE);
  return cmd === undefined || cmd === '--help' ? 0 : 2;
}

process.exitCode = await main(process.argv.slice(2));
