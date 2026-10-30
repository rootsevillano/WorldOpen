import { MINUTES_PER_DAY } from '../time/clock';
import { Memory, Occupation, RELATION_SLOTS, RelationKind } from '../world/agents';
import type { World } from '../world/world';
import { minuteOfDay } from './environment';
import { bedtimeFor, hasFather, pickOccupation, removeAgent, spawnAgent } from './population';
import { fertilityAt } from './fertility';
import { remember } from './social';

/**
 * Ciclo de vida (S5, ADR-0019): cumpleaños con cambios de etapa, embarazos y nacimientos, y muertes.
 * Se evalúa una vez al día, a medianoche. Sin funciones trascendentes (ADR-0003): tasas por tramos.
 */

const DAYS_PER_YEAR = 360;
const PREGNANCY_DAYS = 270;

/** Mortalidad anual por edad (aprox. España): [edad máxima del tramo, probabilidad anual]. */
const MORTALITY: [number, number][] = [
  [0, 0.003], [14, 0.0001], [44, 0.0006], [64, 0.004], [74, 0.015], [84, 0.045], [255, 0.14],
];
/** Con la salud agotada (hambre o sed prolongadas), riesgo diario adicional. */
const STARVATION_DAILY = 0.05;

function band(table: [number, number][], age: number): number {
  for (const [max, p] of table) if (age <= max) return p;
  return 0;
}

/** Día del año (0–359) en el tick actual. */
function dayOfYear(world: World): number {
  const s = world.time.start;
  const day = (s.month - 1) * 30 + (s.day - 1);
  const elapsed = Math.floor((s.hour * 60 + s.minute + world.tick * world.time.minutesPerTick) / MINUTES_PER_DAY);
  return (day + elapsed) % DAYS_PER_YEAR;
}

/**
 * Borra las relaciones con quien deja el pueblo. Si muere (`grieve`), familia, pareja y amigos lo recuerdan y les
 * baja la necesidad social.
 */
export function forgetAgent(world: World, deadId: number, grieve = true): void {
  const a = world.agents;
  for (let j = 0; j < a.count; j++) {
    for (let s = 0; s < RELATION_SLOTS; s++) {
      const k = j * RELATION_SLOTS + s;
      if (a.relId[k] !== deadId) continue;
      const kind = a.relKind[k]!;
      if (grieve && kind !== RelationKind.Acquaintance) {
        remember(world, j, Memory.Grief, a.home[j]!);
        a.social[j] = Math.max(0, a.social[j]! - (kind === RelationKind.Friend ? 0.25 : 0.5));
      }
      a.relKind[k] = RelationKind.None;
      a.relId[k] = 0;
      a.relAffinity[k] = 0;
    }
  }
}

export function lifecycleSystem(world: World): void {
  const dt = world.time.minutesPerTick;
  const m = minuteOfDay(world);
  if (!(m < dt)) return; // una vez al día, en el primer tick tras la medianoche
  const a = world.agents;
  const rng = world.rng;
  const today = dayOfYear(world);
  const mortality = world.num('society.mortality');
  const fertility = world.num('society.fertility');

  // Cumpleaños: cambios de etapa (escuela a los 6, trabajo a los 18, jubilación a los 67) y de horario de sueño.
  for (let i = 0; i < a.count; i++) {
    if (a.birthDay[i] !== today || a.age[i]! >= 120) continue;
    const age = ++a.age[i]!;
    if (age === 6 || age === 18 || age === 67) {
      const [occupation, workplace] = pickOccupation(world, age, a.home[i]!);
      a.occupation[i] = occupation;
      a.workplace[i] = workplace;
    }
    if (age === 12 || age === 18) a.bedtime[i] = bedtimeFor(world, age);
  }

  // Muertes (en orden inverso: el borrado intercambia con el último).
  for (let i = a.count - 1; i >= 0; i--) {
    let p = (band(MORTALITY, a.age[i]!) / DAYS_PER_YEAR) * mortality;
    const starving = a.health[i]! < 0.05;
    if (starving) p += STARVATION_DAILY;
    if (rng.nextFloat() >= p) continue;
    const id = a.ids[i]!;
    const cause = starving ? 'starvation' : 'age';
    forgetAgent(world, id);
    removeAgent(world, id, 'agent.died', { age: a.age[i], cause });
  }

  // Embarazos y nacimientos.
  for (let i = 0; i < a.count; i++) {
    if (a.pregnantDays[i]! > 0) {
      a.pregnantDays[i] = Math.min(PREGNANCY_DAYS, a.pregnantDays[i]! + Math.max(1, Math.round(dt / MINUTES_PER_DAY)));
      if (a.pregnantDays[i]! < PREGNANCY_DAYS) continue;
      a.pregnantDays[i] = 0;
      if (a.count >= a.capacity) {
        world.emit('birth.skipped', { reason: 'capacity' });
        continue;
      }
      const home = a.home[i]!;
      const babyId = spawnAgent(world, home, 0, a.household[i]);
      for (let j = 0; j < a.count; j++) if (a.household[j] === a.household[i] && a.age[j]! >= 18) remember(world, j, Memory.NewChild, home);
      world.emit('agent.born', { agentId: babyId, motherId: a.ids[i], mother: a.names[i], home: world.map.buildings[home]!.id });
      continue;
    }
    if (a.sex[i] !== 0 || a.occupation[i] === Occupation.Child) continue;
    const p = (fertilityAt(a.age[i]!) / DAYS_PER_YEAR) * fertility;
    if (p > 0 && rng.nextFloat() < p && hasFather(world, i)) a.pregnantDays[i] = 1;
  }
}
