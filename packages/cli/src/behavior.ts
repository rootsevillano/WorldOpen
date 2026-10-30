import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CommandEnvelope, CriterionValue, TimeConfig, WorldManifest } from '@worldopen/contracts';
import { DEFAULT_TIME, MINUTES_PER_DAY, ticksPerDay } from '@worldopen/engine';
import { metric, resolvePayload } from '@worldopen/engine';
import { createSimulation } from './simulate';

/**
 * Behavior Gate (ADR-0011). Escenario declarativo: se ejecuta con cada seed y se evalúan aserciones
 * estadísticas sobre el estado en momentos concretos del tiempo de juego.
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

/** Momento de juego: día (0 = el del inicio) y hora del reloj. Sin `at`, se evalúa al final. */
export interface GameMoment {
  day: number;
  hour: number;
  minute?: number;
}

export type Assertion =
  /** Dos ejecuciones con la misma seed producen el mismo hash. */
  | { kind: 'deterministic' }
  /** Métrica evaluada en `at` para cada seed; debe cumplirse en al menos `minPassRatio` de ellas (1 por defecto). */
  | { kind: 'metric'; metric: string; op: '==' | '!=' | '<' | '<=' | '>' | '>='; value: CriterionValue; at?: GameMoment; minPassRatio?: number };

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

/** Tick en que el reloj marca `at` (día relativo al inicio, hora del reloj). */
function momentToTick(at: GameMoment, time: TimeConfig): number {
  const startMinute = time.start.hour * 60 + time.start.minute;
  const minutes = at.day * MINUTES_PER_DAY + at.hour * 60 + (at.minute ?? 0) - startMinute;
  if (minutes < 0) throw new Error(`Momento anterior al inicio del mundo: día ${at.day} ${at.hour}:${at.minute ?? 0}`);
  return Math.round(minutes / time.minutesPerTick);
}

const fmt = (v: CriterionValue) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : String(v));

export function runScenario(file: string, scenario: Scenario, mapPack?: string): ScenarioResult {
  const time: TimeConfig = { ...DEFAULT_TIME, ...scenario.manifest?.time };
  const ticks = scenario.days * ticksPerDay(time);
  const commands = (seed: number): CommandEnvelope[] =>
    (scenario.commands ?? []).map(({ atHour, ...c }, i) => ({
      ...c,
      id: `${scenario.name}-${seed}-${i}`,
      issuer: { userId: 'gate', role: 'admin' },
      ...(atHour === undefined ? {} : { atTick: Math.round((atHour * 60) / time.minutesPerTick) }),
    }));

  const metricAssertions = scenario.assertions.filter((a): a is Extract<Assertion, { kind: 'metric' }> => a.kind === 'metric');
  const checkpoints = [...new Set(metricAssertions.map((a) => (a.at ? momentToTick(a.at, time) : ticks)))].sort((x, y) => x - y);
  if (checkpoints.some((t) => t > ticks)) throw new Error(`${scenario.name}: hay aserciones posteriores al final del escenario`);

  const t0 = performance.now();
  const rejected: string[] = [];
  const runOnce = (seed: number) => {
    const sim = createSimulation({ seed, manifest: { ...scenario.manifest, time }, ...(mapPack ? { mapPack } : {}) });
    for (const c of commands(seed)) {
      const res = sim.submit({ ...c, payload: resolvePayload(sim, c.payload) });
      if (!res.ok) rejected.push(res.message);
    }
    // Recuento acumulado de eventos por tipo: métricas `events.<tipo>`.
    // Recuento por tipo y por tipo:clave=valor de sus datos (p. ej. `agent.died:cause=starvation`).
    const events = new Map<string, number>();
    const drain = () => {
      for (const e of sim.drainEvents()) {
        events.set(e.type, (events.get(e.type) ?? 0) + 1);
        for (const [k, v] of Object.entries(e.data)) {
          if (typeof v !== 'string') continue;
          const key = `${e.type}:${k}=${v}`;
          events.set(key, (events.get(key) ?? 0) + 1);
        }
      }
    };
    // Muestras por checkpoint: tick → métrica → valor.
    const samples = new Map<number, Map<string, CriterionValue | undefined>>();
    for (const cp of checkpoints) {
      while (sim.tick < cp) {
        sim.step(Math.min(1440, cp - sim.tick));
        drain();
      }
      const row = new Map<string, CriterionValue | undefined>();
      for (const a of metricAssertions) {
        if ((a.at ? momentToTick(a.at, time) : ticks) !== cp) continue;
        row.set(a.metric, a.metric.startsWith('events.') ? (events.get(a.metric.slice(7)) ?? 0) : metric(sim, a.metric));
      }
      samples.set(cp, row);
    }
    sim.step(ticks - sim.tick);
    return { hash: sim.hash(), samples };
  };

  const runs = scenario.seeds.map(runOnce);
  const results: AssertionResult[] = scenario.assertions.map((assertion) => {
    if (assertion.kind === 'deterministic') {
      const again = runOnce(scenario.seeds[0]!);
      const passed = again.hash === runs[0]!.hash;
      return { assertion, passed, detail: `determinista: hash ${runs[0]!.hash.toString(16)} vs ${again.hash.toString(16)}` };
    }
    const cp = assertion.at ? momentToTick(assertion.at, time) : ticks;
    const values = runs.map((r) => r.samples.get(cp)!.get(assertion.metric));
    const when = assertion.at ? ` @día ${assertion.at.day} ${assertion.at.hour}:${String(assertion.at.minute ?? 0).padStart(2, '0')}` : ' @final';
    if (values.some((v) => v === undefined)) {
      return { assertion, passed: false, detail: `métrica desconocida: ${assertion.metric}` };
    }
    const passes = values.filter((v) => compare(v!, assertion.op, assertion.value)).length;
    const min = assertion.minPassRatio ?? 1;
    return {
      assertion,
      passed: passes / values.length >= min,
      detail: `${assertion.metric} ${assertion.op} ${fmt(assertion.value)}${when}: ${passes}/${values.length} seeds (mín. ${min}); valores ${values.map((v) => fmt(v!)).join(', ')}`,
    };
  });
  if (rejected.length > 0) {
    results.push({ assertion: { kind: 'deterministic' }, passed: false, detail: `comandos rechazados: ${rejected.join('; ')}` });
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

export function runScenarioDir(dir: string, mapPack?: string): ScenarioResult[] {
  const abs = resolve(dir);
  return readdirSync(abs)
    .filter((f) => f.endsWith('.scenario.json'))
    .sort()
    .map((f) => runScenario(f, JSON.parse(readFileSync(join(abs, f), 'utf8')) as Scenario, mapPack));
}
