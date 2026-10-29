import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CommandEnvelope, CriterionValue, WorldManifest } from '@worldopen/contracts';
import { DEFAULT_TIME, ticksPerDay, type Simulation } from '@worldopen/engine';
import { simulate } from './simulate';

/**
 * Behavior Gate (ADR-0011). Escenario declarativo: se ejecuta con cada seed y se evalúan aserciones
 * estadísticas sobre el estado final. Las métricas de comportamiento de agentes llegan en la Fase 2.
 */
export interface Scenario {
  name: string;
  description: string;
  seeds: number[];
  /** Duración en días de juego (se convierte a ticks según `minutesPerTick`). */
  days: number;
  manifest?: Partial<WorldManifest>;
  commands?: (Omit<CommandEnvelope, 'id' | 'issuer'> & { atHour?: number })[];
  assertions: Assertion[];
}

export type Assertion =
  /** Dos ejecuciones con la misma seed producen el mismo hash. */
  | { kind: 'deterministic' }
  /** Métrica evaluada al final de cada seed; debe cumplirse en al menos `minPassRatio` de ellas (1 por defecto). */
  | { kind: 'metric'; metric: string; op: '==' | '!=' | '<' | '<=' | '>' | '>='; value: CriterionValue; minPassRatio?: number };

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  detail: string;
}

export interface ScenarioResult {
  file: string;
  name: string;
  passed: boolean;
  results: AssertionResult[];
  ticksPerSeed: number;
  elapsedMs: number;
}

/** Métricas disponibles. Se amplían en cada fase con comportamientos observables. */
function metric(sim: Simulation, name: string): CriterionValue | undefined {
  if (name === 'clock.elapsedDays') return Math.floor(sim.tick / ticksPerDay(sim.manifest.time));
  if (name === 'agents.count') return sim.world.agents.count;
  if (name.startsWith('criteria.')) return sim.world.criteria[name.slice('criteria.'.length)];
  return undefined;
}

function compare(a: CriterionValue, op: string, b: CriterionValue): boolean {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    default: throw new Error(`Operador desconocido: ${op}`);
  }
}

export function runScenario(file: string, scenario: Scenario): ScenarioResult {
  const time = { ...DEFAULT_TIME, ...scenario.manifest?.time };
  const ticks = scenario.days * ticksPerDay(time);
  const minutesPerTick = time.minutesPerTick;
  const commands = (seed: number): CommandEnvelope[] =>
    (scenario.commands ?? []).map(({ atHour, ...c }, i) => ({
      ...c,
      id: `${scenario.name}-${seed}-${i}`,
      issuer: { userId: 'gate', role: 'admin' },
      ...(atHour === undefined ? {} : { atTick: Math.round((atHour * 60) / minutesPerTick) }),
    }));

  const t0 = performance.now();
  const runs = scenario.seeds.map((seed) =>
    simulate({ seed, ticks, commands: commands(seed), manifest: { ...scenario.manifest, time } }),
  );
  const results: AssertionResult[] = scenario.assertions.map((assertion) => {
    if (assertion.kind === 'deterministic') {
      const seed = scenario.seeds[0]!;
      const again = simulate({ seed, ticks, commands: commands(seed), manifest: { ...scenario.manifest, time } });
      const passed = again.report.hash === runs[0]!.report.hash;
      return { assertion, passed, detail: `hash ${runs[0]!.report.hash} vs ${again.report.hash}` };
    }
    const values = runs.map(({ sim }) => metric(sim, assertion.metric));
    if (values.some((v) => v === undefined)) {
      return { assertion, passed: false, detail: `métrica desconocida: ${assertion.metric}` };
    }
    const passes = values.filter((v) => compare(v!, assertion.op, assertion.value)).length;
    const ratio = passes / values.length;
    const min = assertion.minPassRatio ?? 1;
    return {
      assertion,
      passed: ratio >= min,
      detail: `${assertion.metric} ${assertion.op} ${String(assertion.value)}: ${passes}/${values.length} seeds (mín. ${min}); valores ${values.join(', ')}`,
    };
  });
  const rejected = runs.flatMap((r) => r.report.rejected);
  if (rejected.length > 0) {
    results.push({ assertion: { kind: 'deterministic' }, passed: false, detail: `comandos rechazados: ${rejected.map((r) => r.message).join('; ')}` });
  }

  return {
    file,
    name: scenario.name,
    passed: results.every((r) => r.passed),
    results,
    ticksPerSeed: ticks,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

export function runScenarioDir(dir: string): ScenarioResult[] {
  const abs = resolve(dir);
  return readdirSync(abs)
    .filter((f) => f.endsWith('.scenario.json'))
    .sort()
    .map((f) => runScenario(f, JSON.parse(readFileSync(join(abs, f), 'utf8')) as Scenario));
}
