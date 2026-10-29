import { MEMORY_SLOTS, Memory, RELATION_SLOTS, RelationKind } from '../world/agents';
import type { World } from '../world/world';

/** Memoria acotada (S6): anillo de `MEMORY_SLOTS` recuerdos por agente. */
export function remember(world: World, i: number, kind: number, building: number): void {
  const a = world.agents;
  const base = i * MEMORY_SLOTS;
  const slot = a.memHead[i]!;
  a.memTick[base + slot] = world.tick;
  a.memKind[base + slot] = kind;
  a.memBuilding[base + slot] = building;
  a.memHead[i] = (slot + 1) % MEMORY_SLOTS;
}

/** ¿Recuerda el agente `kind` en `building` en los últimos `withinTicks`? */
export function recalls(world: World, i: number, kind: number, building: number, withinTicks: number): boolean {
  const a = world.agents;
  const base = i * MEMORY_SLOTS;
  for (let s = 0; s < MEMORY_SLOTS; s++) {
    if (a.memKind[base + s] === kind && a.memBuilding[base + s] === building && world.tick - a.memTick[base + s]! <= withinTicks) {
      return true;
    }
  }
  return false;
}

/**
 * Ajusta la afinidad de `i` hacia el agente `otherId`. Si no lo conoce, ocupa un hueco libre o sustituye al
 * conocido más débil (nunca a la familia). Devuelve `true` si la relación acaba de convertirse en amistad.
 */
export function bond(world: World, i: number, otherId: number, delta: number, kindIfNew: number = RelationKind.Acquaintance): boolean {
  const a = world.agents;
  const base = i * RELATION_SLOTS;
  let slot = -1;
  let free = -1;
  let weakest = -1;
  for (let s = 0; s < RELATION_SLOTS; s++) {
    const k = base + s;
    const kind = a.relKind[k]!;
    if (kind !== RelationKind.None && a.relId[k] === otherId) {
      slot = k;
      break;
    }
    if (kind === RelationKind.None) {
      if (free < 0) free = k;
    } else if (kind !== RelationKind.Family && (weakest < 0 || a.relAffinity[k]! < a.relAffinity[weakest]!)) {
      weakest = k;
    }
  }
  if (slot < 0) {
    slot = free >= 0 ? free : weakest;
    if (slot < 0) return false;
    a.relId[slot] = otherId;
    a.relKind[slot] = kindIfNew;
    a.relAffinity[slot] = 0;
  }
  const before = a.relAffinity[slot]!;
  const after = Math.max(-1, Math.min(1, before + delta));
  a.relAffinity[slot] = after;
  if (a.relKind[slot] === RelationKind.Acquaintance && after >= 0.5) {
    a.relKind[slot] = RelationKind.Friend;
    return true;
  }
  return false;
}

/** Una vez por hora de juego, quienes coinciden en un local charlan con alguien presente (al azar determinista). */
export function socialSystem(world: World): void {
  const perHour = Math.max(1, Math.round(60 / world.time.minutesPerTick));
  if (world.tick % perHour !== 0) return;
  const a = world.agents;
  const map = world.map;
  // Índice edificio → agentes presentes en locales (counting sort, orden por índice de agente).
  const n = map.buildings.length;
  const start = new Int32Array(n + 1);
  for (let i = 0; i < a.count; i++) {
    const loc = a.location[i]!;
    if (loc >= 0 && map.buildings[loc]!.use !== 'residential') start[loc + 1]!++;
  }
  for (let b = 0; b < n; b++) start[b + 1]! += start[b]!;
  const fill = start.slice(0, n);
  const members = new Int32Array(start[n]!);
  for (let i = 0; i < a.count; i++) {
    const loc = a.location[i]!;
    if (loc >= 0 && map.buildings[loc]!.use !== 'residential') members[fill[loc]!++] = i;
  }
  for (let b = 0; b < n; b++) {
    const from = start[b]!;
    const size = start[b + 1]! - from;
    if (size < 2) continue;
    for (let k = 0; k < size; k++) {
      const i = members[from + k]!;
      let other = members[from + world.rng.int(0, size - 2)]!;
      if (other === i) other = members[from + size - 1]!;
      const delta = 0.08 + 0.12 * (a.sociability[i]! + a.sociability[other]!) * 0.5;
      if (bond(world, i, a.ids[other]!, delta)) {
        remember(world, i, Memory.NewFriend, b);
        world.emit('agent.friendship', { agentId: a.ids[i], name: a.names[i], friendId: a.ids[other], friend: a.names[other] });
      }
      a.social[i] = Math.min(1, a.social[i]! + 0.05);
    }
  }
}
