import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runScenarioDir } from './behavior';
import { simulate } from './simulate';

const USAGE = `worldopen — motor de simulación WorldOpen (headless)

Uso:
  worldopen simulate --ticks <n> [--seed <n>] [--minutes-per-tick <n>] [--out <report.json>]
  worldopen gate behavior <directorio de escenarios>
`;

function main(argv: string[]): number {
  const [cmd, sub, ...rest] = argv;

  if (cmd === 'simulate') {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: {
        ticks: { type: 'string', default: '1440' },
        seed: { type: 'string', default: '1' },
        'minutes-per-tick': { type: 'string' },
        out: { type: 'string' },
      },
    });
    const { report } = simulate({
      seed: Number(values.seed),
      ticks: Number(values.ticks),
      ...(values['minutes-per-tick'] ? { minutesPerTick: Number(values['minutes-per-tick']) } : {}),
    });
    const json = JSON.stringify(report, null, 2);
    if (values.out) writeFileSync(values.out, json + '\n');
    console.log(json);
    return 0;
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

process.exit(main(process.argv.slice(2)));
