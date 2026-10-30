import { Action, Memory, Occupation, Resource } from '../world/agents';
import type { World } from '../world/world';
import { dayOfWeek, minuteOfDay } from './environment';
import { WORKPLACE_USE } from './population';
import { remember } from './social';

/**
 * Dinero y empleo (E1-C, ADR-0022). Cada habitante tiene un monedero (`money`) y cada negocio una caja (`cash`).
 * Precios fijos × `economy.priceLevel`; salarios por minuto trabajado × `economy.wageLevel`; el Estado (fuera del
 * pueblo) paga a los funcionarios, las pensiones y las prestaciones (× `economy.welfare`) y cobra el IRPF; el Exterior
 * vende las importaciones, compra los excedentes y cobra los gastos fijos de los hogares.
 */

/**
 * Precios por unidad (el agua de las fuentes es gratis). Calibrados con la producción medida (ADR-0022): un
 * agricultor produce ≈ 35 raciones por jornada (× estación) y un aserrador ≈ 42 de leña; a estos precios cada uno
 * cubre su jornal, y la tienda gana ≈ 1.2 por ración vendida.
 */
const RETAIL_PRICE: Record<number, number> = { [Resource.Food]: 3.4, [Resource.Water]: 0, [Resource.Wood]: 2.2 };
/** Lo que paga una tienda por la comida importada y por la cosecha local. */
export const WHOLESALE_PRICE = 2.2;
export const FARMGATE_PRICE = 2.2;
/** Lo que paga el Exterior por los excedentes de huertas (comida) y aserraderos (leña). */
const EXPORT_PRICE: Record<string, number> = { agriculture: 2.2, industrial: 1.8 };
/** Se exporta lo que pasa del 20 % de la capacidad del almacén. */
const EXPORT_ABOVE = 0.2;
/** Jornal bruto por ocupación (se cobra entero con 5 h trabajadas en el día, proporcional si menos) e IRPF. */
const DAILY_WAGE: Partial<Record<number, number>> = {
  [Occupation.Shopkeeper]: 80, [Occupation.Farmer]: 60, [Occupation.Sawyer]: 66, [Occupation.CivilServant]: 85,
};
const FULL_DAY_MINUTES = 300;
const INCOME_TAX = 0.15;
/** Gasto de ocio al llegar a un local comercial. */
const LEISURE_SPEND = 4;
/** Gastos fijos diarios (vivienda, suministros, otros bienes) por adulto y por menor. */
const LIVING_COST = { adult: 8, minor: 3 };
/** Transferencias diarias del Estado. */
const PENSION = 45;
const UNEMPLOYMENT_BENEFIT = 25;
const CHILD_BENEFIT = 15;
/** Ayuda de emergencia: un hogar sin dinero para un día de comida recibe lo que le falta (× `economy.welfare`). */
const FOOD_PER_DAY = 4.3;
/** Un puesto de trabajo por cada 40 m² construidos (mínimo 1). */
const POSITION_M2 = 40;
/** Contrata si tiene caja para 4 semanas de nóminas; despide si no llega a media; reparte beneficios por encima de 8. */
const HIRE_WEEKS = 4;
const FIRE_WEEKS = 0.5;
const DIVIDEND_WEEKS = 8;
/** Nómina semanal de referencia de un trabajador del negocio `b` (5 jornadas). */
function weeklyWage(world: World, b: number): number {
  return 5 * DAILY_WAGE[occupationFor(world, b)]! * world.num('economy.wageLevel');
}
/** Edad mínima para tener dinero propio y hacer compras (recados, ADR-0018). */
export const MONEY_AGE = 14;

/** Precio base de referencia (× `economy.priceLevel`), sin el ajuste de cada negocio. */
export function priceOf(world: World, r: number): number {
  return RETAIL_PRICE[r]! * world.num('economy.priceLevel');
}

/** Precio en un punto de venta concreto: el base × su multiplicador (ADR-0023). */
export function priceAt(world: World, b: number, r: number): number {
  return priceOf(world, r) * world.buildings.price[b]!;
}

function sellers(world: World, r: number): number[] {
  return r === Resource.Food ? world.map.byUse.retail : world.map.byUse.industrial;
}

/** Precio medio de mercado de `r` entre los puntos de venta en uso (o el base si no hay ninguno). */
export function marketPrice(world: World, r: number): number {
  const bs = world.buildings;
  let n = 0;
  let total = 0;
  for (const b of sellers(world, r)) {
    if (bs.state[b] !== 0) continue;
    n++;
    total += bs.price[b]!;
  }
  return priceOf(world, r) * (n === 0 ? 1 : total / n);
}

/** Precio más barato de `r` (quien va a comprar no sabe aún dónde, pero sí si le llega para la más barata). */
function cheapestPrice(world: World, r: number): number {
  const bs = world.buildings;
  let min = Infinity;
  for (const b of sellers(world, r)) if (bs.state[b] === 0 && bs.price[b]! < min) min = bs.price[b]!;
  return priceOf(world, r) * (min === Infinity ? 1 : min);
}

/** Ajuste diario del precio por existencias (ADR-0023). */
const PRICE_SENSITIVITY = 0.8;
const PRICE_INERTIA = 0.25;
const PRICE_RANGE: [number, number] = [0.7, 2.5];

/**
 * 06:00: cada tienda compara sus existencias con su demanda (≈ 3 días de su zona) y cada aserradero las suyas con el
 * nivel al que exporta; si escasean, sube el precio; si sobran, lo baja. Con inercia: un 25 % del camino al día.
 */
export function updatePrices(world: World, cap: (b: number) => number): void {
  const bs = world.buildings;
  const adjust = (b: number, ratio: number) => {
    const target = Math.min(PRICE_RANGE[1], Math.max(PRICE_RANGE[0], 1 + PRICE_SENSITIVITY * (1 - ratio)));
    bs.price[b]! += PRICE_INERTIA * (target - bs.price[b]!);
  };
  for (const s of world.map.byUse.retail) if (bs.demand[s]! > 0) adjust(s, bs.food[s]! / bs.demand[s]!);
  for (const s of world.map.byUse.industrial) adjust(s, bs.wood[s]! / (EXPORT_ABOVE * cap(s)));
}

/** ¿Es un negocio privado (tiene caja, contrata y despide)? */
export function isBusiness(world: World, b: number): boolean {
  const use = world.map.buildings[b]!.use;
  return use === 'retail' || use === 'agriculture' || use === 'industrial';
}

export function positionsOf(world: World, b: number): number {
  return Math.max(1, Math.floor(world.map.buildings[b]!.grossFloorAreaM2 / POSITION_M2));
}

/** Compra de `amount` unidades de `r` por el agente `i` en `b`: devuelve cuántas puede pagar y las cobra. */
export function buy(world: World, i: number, b: number, r: number, amount: number): number {
  const price = priceAt(world, b, r);
  if (price === 0) return amount;
  const a = world.agents;
  const affordable = Math.min(amount, Math.floor(a.money[i]! / price));
  if (affordable <= 0) return 0;
  a.money[i]! -= affordable * price;
  world.buildings.cash[b]! += affordable * price;
  return affordable;
}

/** ¿Puede pagar al menos una unidad donde esté más barato? (si no, ni lo intenta: ADR-0022). */
export function canAfford(world: World, i: number, r: number): boolean {
  return world.agents.money[i]! >= cheapestPrice(world, r);
}

/** Recuerda que no pudo pagar (la tienda no estaba vacía). */
export function cannotPay(world: World, i: number, b: number, r: number): void {
  const a = world.agents;
  remember(world, i, Memory.Broke, b);
  world.emit('purchase.unaffordable', { agentId: a.ids[i], name: a.names[i], building: world.map.buildings[b]!.id, resource: r });
}

/** Gasto de ocio al llegar a un local comercial (si puede permitírselo). */
export function spendLeisure(world: World, i: number, b: number): void {
  const a = world.agents;
  const spend = LEISURE_SPEND * world.num('economy.priceLevel');
  if (world.map.buildings[b]!.use !== 'retail' || a.age[i]! < MONEY_AGE || a.money[i]! < spend * 5) return;
  a.money[i]! -= spend;
  world.buildings.cash[b]! += spend;
}

/** Cobro de la cosecha entregada: la tienda paga lo que puede. */
export function payHarvest(world: World, shop: number, farm: number, amount: number): void {
  const bs = world.buildings;
  const paid = Math.min(bs.cash[shop]!, amount * FARMGATE_PRICE * world.num('economy.priceLevel'));
  bs.cash[shop]! -= paid;
  bs.cash[farm]! += paid;
}

/** Minutos trabajados en el día (para el jornal de medianoche). */
export function clockWork(world: World): void {
  const a = world.agents;
  const dt = world.time.minutesPerTick;
  for (let i = 0; i < a.count; i++) {
    const w = a.workplace[i]!;
    if (w >= 0 && a.action[i] === Action.Work && a.location[i] === w && a.occupation[i] !== Occupation.Student) {
      a.workedToday[i] = Math.min(1440, a.workedToday[i]! + dt);
    }
  }
}

/** Medianoche: jornal de quien trabajó; el negocio paga lo que puede, a los funcionarios les paga el Estado. */
function payWages(world: World): void {
  const a = world.agents;
  const bs = world.buildings;
  const level = world.num('economy.wageLevel');
  for (let i = 0; i < a.count; i++) {
    const worked = a.workedToday[i]!;
    a.workedToday[i] = 0;
    const w = a.workplace[i]!;
    const wage = DAILY_WAGE[a.occupation[i]!];
    if (worked === 0 || w < 0 || wage === undefined) continue;
    let paid = wage * level * Math.min(1, worked / FULL_DAY_MINUTES);
    if (a.occupation[i] !== Occupation.CivilServant) {
      paid = Math.min(bs.cash[w]!, paid);
      bs.cash[w]! -= paid;
    }
    a.money[i]! += paid * (1 - INCOME_TAX);
  }
}

/** 06:00: el Exterior compra lo que sobra en huertas y aserraderos. */
export function exportSurplus(world: World, cap: (b: number) => number): void {
  const bs = world.buildings;
  const level = world.num('economy.priceLevel');
  const price = EXPORT_PRICE.agriculture! * level;
  for (const f of world.map.byUse.agriculture) {
    const surplus = bs.food[f]! - EXPORT_ABOVE * cap(f);
    if (surplus <= 0) continue;
    bs.food[f]! -= surplus;
    bs.cash[f]! += surplus * price;
  }
  for (const s of world.map.byUse.industrial) {
    const surplus = bs.wood[s]! - EXPORT_ABOVE * cap(s);
    if (surplus <= 0) continue;
    bs.wood[s]! -= surplus;
    bs.cash[s]! += surplus * EXPORT_PRICE.industrial! * level;
  }
}

/**
 * Medianoche: transferencias del Estado, gastos fijos y reparto del dinero en el hogar (lo comparten a partes iguales
 * los miembros de 14+, que son quienes compran).
 */
export function dailyMoney(world: World): void {
  payWages(world);
  const a = world.agents;
  const welfare = world.num('economy.welfare');
  const priceLevel = world.num('economy.priceLevel');
  const pool = new Map<number, [total: number, members: number]>();
  for (let i = 0; i < a.count; i++) {
    const age = a.age[i]!;
    const occ = a.occupation[i]!;
    let delta = -(age >= 18 ? LIVING_COST.adult : LIVING_COST.minor) * priceLevel;
    if (occ === Occupation.Retired) delta += PENSION * welfare;
    else if (occ === Occupation.Unemployed && age >= 18) delta += UNEMPLOYMENT_BENEFIT * welfare;
    if (age < 18) delta += CHILD_BENEFIT * welfare;
    // El dinero de los menores de 14 (prestación, gastos) va a cuenta del hogar.
    const hh = a.household[i]!;
    const p = pool.get(hh) ?? [0, 0];
    p[0] += delta + (age >= MONEY_AGE ? a.money[i]! : 0);
    if (age >= MONEY_AGE) p[1]++;
    pool.set(hh, p);
  }
  // Ayuda de emergencia (servicios sociales): completa un día de comida del hogar.
  const day = FOOD_PER_DAY * marketPrice(world, Resource.Food);
  const size = new Map<number, number>();
  for (let i = 0; i < a.count; i++) size.set(a.household[i]!, (size.get(a.household[i]!) ?? 0) + 1);
  for (const [hh, p] of pool) {
    const need = day * size.get(hh)!;
    if (p[1] > 0 && p[0] < need) p[0] = Math.max(0, p[0]) + (need - Math.max(0, p[0])) * Math.min(1, welfare);
  }
  for (let i = 0; i < a.count; i++) {
    if (a.age[i]! < MONEY_AGE) {
      a.money[i] = 0;
      continue;
    }
    const p = pool.get(a.household[i]!)!;
    a.money[i] = Math.max(0, p[0] / p[1]);
  }
}

/** Ocupación de quien trabaja en un edificio de ese uso. */
function occupationFor(world: World, b: number): number {
  const use = world.map.buildings[b]!.use;
  for (const [occ, u] of Object.entries(WORKPLACE_USE)) if (u === use) return Number(occ);
  return Occupation.Unemployed;
}

/**
 * Lunes a medianoche: cada negocio sin caja para media semana de nóminas despide a alguien; con caja para cuatro y
 * puestos libres, contrata a la persona en paro más cercana; por encima de ocho semanas, reparte beneficios (salen del
 * pueblo, a sus dueños).
 */
export function weeklyJobs(world: World): void {
  const a = world.agents;
  const bs = world.buildings;
  const map = world.map;
  const employees = new Map<number, number[]>();
  const jobless: number[] = [];
  for (let i = 0; i < a.count; i++) {
    const w = a.workplace[i]!;
    const occ = a.occupation[i]!;
    if (w >= 0 && isBusiness(world, w) && occ !== Occupation.Student) {
      const list = employees.get(w) ?? [];
      list.push(i);
      employees.set(w, list);
    } else if (occ === Occupation.Unemployed && a.age[i]! >= 18 && a.age[i]! < 67) jobless.push(i);
  }
  const businesses = [...map.byUse.retail, ...map.byUse.agriculture, ...map.byUse.industrial].sort((x, y) => x - y);
  for (const b of businesses) {
    const staff = employees.get(b) ?? [];
    const wage = weeklyWage(world, b);
    const payroll = Math.max(1, staff.length) * wage;
    if (staff.length > 0 && bs.cash[b]! < FIRE_WEEKS * payroll) {
      const i = staff[world.rng.int(0, staff.length - 1)]!;
      a.occupation[i] = Occupation.Unemployed;
      a.workplace[i] = -1;
      if (a.action[i] === Action.Work) a.action[i] = Action.Stay;
      world.emit('job.lost', { agentId: a.ids[i], name: a.names[i], building: map.buildings[b]!.id });
      continue;
    }
    if (bs.cash[b]! > DIVIDEND_WEEKS * payroll) bs.cash[b] = DIVIDEND_WEEKS * payroll;
    if (bs.cash[b]! < HIRE_WEEKS * (staff.length + 1) * wage || staff.length >= positionsOf(world, b) || jobless.length === 0) continue;
    const c = map.buildings[b]!.centroid;
    let best = -1;
    let bestD = Infinity;
    jobless.forEach((i, k) => {
      const h = map.buildings[a.home[i]!]!.centroid;
      const d = (h.x - c.x) * (h.x - c.x) + (h.z - c.z) * (h.z - c.z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    const i = jobless.splice(best, 1)[0]!;
    a.occupation[i] = occupationFor(world, b);
    a.workplace[i] = b;
    world.emit('job.hired', { agentId: a.ids[i], name: a.names[i], building: map.buildings[b]!.id });
  }
}

/** Caja inicial de cada negocio: un mes de nóminas de su plantilla más un fondo. */
export function seedCash(world: World): void {
  const a = world.agents;
  const bs = world.buildings;
  for (let i = 0; i < a.count; i++) {
    const w = a.workplace[i]!;
    if (w >= 0 && isBusiness(world, w) && a.occupation[i] !== Occupation.Student) bs.cash[w]! += 4 * weeklyWage(world, w);
  }
  for (const b of [...world.map.byUse.retail, ...world.map.byUse.agriculture, ...world.map.byUse.industrial]) bs.cash[b]! += 500;
}

/** Ciclo monetario diario y semanal (a medianoche). */
export function moneySystem(world: World): void {
  if (!(minuteOfDay(world) < world.time.minutesPerTick)) return;
  dailyMoney(world);
  if (dayOfWeek(world) === 0) weeklyJobs(world);
}
