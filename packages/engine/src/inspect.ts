import type { AgentDetail, BuildingDetail, EconomySummary } from '@worldopen/contracts';
import {
  ACTION_COUNT,
  ACTION_NAMES,
  MEMORY_NAMES,
  MEMORY_SLOTS,
  OCCUPATION_NAMES,
  RELATION_NAMES,
  RELATION_SLOTS,
  RESOURCE_NAMES,
  Occupation,
  RelationKind,
  Resource,
} from './world/agents';
import { householdHasCar } from './agents/vehicles';
import { housePrice } from './agents/housing';
import { dailyWageAt, isBusiness, marketPrice, positionsOf, priceAt, rentNow, wageIndex } from './agents/money';
import type { World } from './world/world';

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Nombre del adulto de más edad del hogar casero (o `null`: fondo de fuera o casero ya ido). */
function landlordName(world: World, household: number): string | null {
  if (household === 0) return null;
  const a = world.agents;
  let best = -1;
  for (let j = 0; j < a.count; j++) if (a.household[j] === household && (best < 0 || a.age[j]! > a.age[best]!)) best = j;
  return best < 0 ? null : a.names[best]!;
}

/** Vista del inspector de un agente (G1). Solo lectura. */
export function agentDetail(world: World, id: number): AgentDetail | null {
  const a = world.agents;
  const i = a.indexOf(id);
  if (i < 0) return null;
  const b = world.map.buildings;
  const scores: Record<string, number> = {};
  for (let k = 0; k < ACTION_COUNT; k++) {
    const s = a.scores[i * ACTION_COUNT + k]!;
    if (s !== 0) scores[ACTION_NAMES[k]!] = round(s);
  }
  const memory: AgentDetail['memory'] = [];
  for (let s = 1; s <= MEMORY_SLOTS; s++) {
    const k = i * MEMORY_SLOTS + ((a.memHead[i]! - s + MEMORY_SLOTS) % MEMORY_SLOTS);
    const kind = a.memKind[k]!;
    if (kind === 0) continue;
    const building = a.memBuilding[k]!;
    memory.push({ tick: a.memTick[k]!, kind: MEMORY_NAMES[kind] ?? String(kind), building: building >= 0 ? b[building]!.id : null });
  }
  const relations: AgentDetail['relations'] = [];
  for (let s = 0; s < RELATION_SLOTS; s++) {
    const k = i * RELATION_SLOTS + s;
    if (a.relKind[k] === RelationKind.None) continue;
    const j = a.indexOf(a.relId[k]!);
    if (j < 0) continue;
    relations.push({ agentId: a.relId[k]!, name: a.names[j]!, kind: RELATION_NAMES[a.relKind[k]!]!, affinity: round(a.relAffinity[k]!) });
  }
  relations.sort((p, q) => q.affinity - p.affinity);
  const loc = a.location[i]!;
  const work = a.workplace[i]!;
  return {
    id,
    name: a.names[i]!,
    age: a.age[i]!,
    sex: a.sex[i] === 0 ? 'female' : 'male',
    traits: { sociability: round(a.sociability[i]!), bravery: round(a.bravery[i]!) },
    occupation: OCCUPATION_NAMES[a.occupation[i]!]!,
    workplace: work >= 0 ? b[work]!.id : null,
    home: b[a.home[i]!]!.id,
    location: loc >= 0 ? b[loc]!.id : null,
    action: ACTION_NAMES[a.action[i]!]!,
    needs: {
      energy: round(a.energy[i]!), shelter: round(a.shelter[i]!), social: round(a.social[i]!),
      hunger: round(a.hunger[i]!), thirst: round(a.thirst[i]!), work: round(a.work[i]!),
    },
    health: round(a.health[i]!),
    money: round(a.money[i]!),
    housing: {
      tenure: a.renting[i] ? 'renter' : a.mortgage[i]! > 0 ? 'mortgaged' : 'owner',
      arrears: a.arrears[i]!,
      landlord: landlordName(world, a.renting[i] ? a.landlord[i]! : 0),
      mortgage: round(a.mortgage[i]!),
    },
    car: { household: householdHasCar(world, a.household[i]!), driving: a.driving[i] === 1 },
    carrying: a.carryKind[i] ? { resource: RESOURCE_NAMES[a.carryKind[i]!] as 'food' | 'water' | 'wood', amount: round(a.carryAmount[i]!) } : null,
    lastScores: scores,
    memory,
    relations,
    position: { x: a.positions[i * 3]!, y: a.positions[i * 3 + 1]!, z: a.positions[i * 3 + 2]! },
  };
}

export function buildingDetail(world: World, id: string): BuildingDetail | null {
  const index = world.map.buildings.findIndex((b) => b.id === id);
  if (index < 0) return null;
  const rec = world.map.buildings[index]!;
  const bs = world.buildings;
  const a = world.agents;
  let occupants = 0;
  let workers = 0;
  let queue = 0;
  let staff = 0;
  for (let i = 0; i < a.count; i++) {
    if (a.workplace[i] === index && a.occupation[i] !== Occupation.Student) staff++;
    if (a.location[i] !== index) continue;
    occupants++;
    if (a.workplace[i] === index) workers++;
    if (a.busyLeft[i]! > 0 && a.home[i] !== index) queue++;
  }
  return {
    id,
    index,
    use: rec.use,
    state: bs.state[index] as BuildingDetail['state'],
    floors: rec.floorsAboveGround,
    stock: { food: round(bs.food[index]!), water: round(bs.water[index]!), wood: round(bs.wood[index]!) },
    occupants,
    residents: bs.residents[index]!,
    workers,
    queue,
    business: isBusiness(world, index)
      ? {
          cash: round(bs.cash[index]!),
          staff,
          positions: positionsOf(world, index),
          wage: round(dailyWageAt(world, index)),
          price: rec.use === 'retail' ? round(priceAt(world, index, Resource.Food)) : rec.use === 'industrial' ? round(priceAt(world, index, Resource.Wood)) : null,
        }
      : null,
  };
}

export function economySummary(world: World): EconomySummary {
  const bs = world.buildings;
  const u = world.map.byUse;
  const sum = (list: number[], col: Float32Array) => round(list.reduce((s, b) => s + col[b]!, 0));
  const a = world.agents;
  let queueing = 0;
  let money = 0;
  let active = 0;
  let jobless = 0;
  for (let i = 0; i < a.count; i++) {
    if (a.busyLeft[i]! > 0 && a.location[i] !== a.home[i]) queueing++;
    money += a.money[i]!;
    const occ = a.occupation[i]!;
    if (a.age[i]! < 18 || occ === Occupation.Retired || occ === Occupation.Student || occ === Occupation.Child) continue;
    active++;
    if (occ === Occupation.Unemployed) jobless++;
  }
  let cash = 0;
  for (let b = 0; b < world.map.buildings.length; b++) if (isBusiness(world, b)) cash += bs.cash[b]!;
  return {
    shopFood: sum(u.retail, bs.food),
    fountainWater: sum(u.publicServices, bs.water),
    sawmillWood: sum(u.industrial, bs.wood),
    pantryFood: sum(world.map.homes, bs.food),
    pantryWater: sum(world.map.homes, bs.water),
    pantryWood: sum(world.map.homes, bs.wood),
    queueing,
    householdMoney: round(money),
    businessCash: round(cash),
    unemploymentRate: active === 0 ? 0 : round(jobless / active),
    foodPrice: round(marketPrice(world, Resource.Food)),
    woodPrice: round(marketPrice(world, Resource.Wood)),
    rent: round(rentNow(world)),
    wageIndex: round(wageIndex(world)),
    housePrice: round(housePrice(world)),
  };
}
