import { Occupation, RELATION_SLOTS, RelationKind } from '../world/agents';
import type { World } from '../world/world';
import { MONEY_AGE } from './money';

/**
 * Herencia y compraventa de viviendas entre particulares (ADR-0028). Cada hogar lleva la cuenta de las viviendas que
 * tiene además de la suya (`spare`, en todos sus miembros): heredadas o compradas para alquilar.
 */

/** Edad desde la que alguien mantiene el hogar (con solo menores, el hogar se disuelve y el patrimonio sale). */
const ADULT_AGE = 18;

/** Pone `value` en la columna `col` de todos los miembros del hogar. */
export function setHousehold(world: World, household: number, col: Uint8Array | Uint32Array, value: number): void {
  const a = world.agents;
  for (let i = 0; i < a.count; i++) if (a.household[i] === household) col[i] = value;
}

function spareOf(world: World, household: number): number {
  const a = world.agents;
  for (let i = 0; i < a.count; i++) if (a.household[i] === household) return a.spare[i]!;
  return 0;
}

/** Heredero de `i`: un familiar o su pareja que viva en otro hogar del pueblo (el de más afinidad), o −1. */
function heirOf(world: World, i: number): number {
  const a = world.agents;
  let best = -1;
  let bestAffinity = -Infinity;
  for (let s = 0; s < RELATION_SLOTS; s++) {
    const k = i * RELATION_SLOTS + s;
    const kind = a.relKind[k]!;
    if (kind !== RelationKind.Family && kind !== RelationKind.Partner) continue;
    const j = a.indexOf(a.relId[k]!);
    if (j < 0 || a.household[j] === a.household[i] || a.age[j]! < ADULT_AGE) continue;
    if (a.relAffinity[k]! > bestAffinity) {
      bestAffinity = a.relAffinity[k]!;
      best = j;
    }
  }
  return best;
}

/**
 * Antes de retirar a quien muere: si queda otro adulto en su hogar, su dinero pasa a quien comparta la casa (y la
 * vivienda sigue siendo del hogar). Si era el último adulto, su patrimonio sale del hogar: dinero, la vivienda si estaba
 * pagada (con hipoteca, se la queda el banco), las demás viviendas y los inquilinos pasan a su heredero; sin herederos,
 * al Estado (los inquilinos, a un fondo de fuera).
 */
export function bequeath(world: World, i: number): void {
  const a = world.agents;
  const hh = a.household[i]!;
  let keeper = -1;
  let adults = 0;
  for (let j = 0; j < a.count; j++) {
    if (j === i || a.household[j] !== hh) continue;
    if (a.age[j]! >= ADULT_AGE) adults++;
    if (keeper < 0 && a.age[j]! >= MONEY_AGE) keeper = j;
  }
  if (adults > 0) {
    if (keeper >= 0) {
      a.money[keeper]! += a.money[i]!;
      a.money[i] = 0;
    }
    return;
  }
  const heir = heirOf(world, i);
  const heirHousehold = heir >= 0 ? a.household[heir]! : 0;
  const homes = (a.renting[i] === 0 && a.mortgage[i] === 0 ? 1 : 0) + a.spare[i]!;
  let tenants = 0;
  for (let j = 0; j < a.count; j++) {
    if (a.renting[j] && a.landlord[j] === hh) {
      a.landlord[j] = heirHousehold;
      tenants++;
    }
  }
  const amount = a.money[i]!;
  a.money[i] = 0;
  setHousehold(world, hh, a.spare, 0);
  if (heir < 0) {
    world.emit('estate.toState', { name: a.names[i], amount: Math.round(amount), homes, tenants });
    return;
  }
  a.money[heir]! += amount;
  if (homes > 0) setHousehold(world, heirHousehold, a.spare, Math.min(255, spareOf(world, heirHousehold) + homes));
  world.emit('inheritance', { name: a.names[i], heir: a.names[heir], heirId: a.ids[heir], amount: Math.round(amount), homes, tenants });
}

/**
 * Un hogar nuevo de alquiler: primero, un hogar del pueblo con una vivienda vacía la alquila (el que más tenga); si no,
 * devuelve 0 y decide `assignLandlord` (inversor o fondo).
 */
export function letSpareHome(world: World, household: number): number {
  const a = world.agents;
  let best = 0;
  let most = 0;
  for (let i = 0; i < a.count; i++) {
    const hh = a.household[i]!;
    if (hh !== household && a.spare[i]! > most) {
      most = a.spare[i]!;
      best = hh;
    }
  }
  if (best !== 0) {
    setHousehold(world, best, a.spare, most - 1);
    world.emit('home.let', { household: best });
  }
  return best;
}

/** Venta del día: hogar → [comprador (0 = Exterior), precio]. */
export type Sales = Map<number, [number, number]>;

/** Probabilidad diaria de vender por gusto una vivienda de sobra, y colchón por debajo del cual se vende por necesidad. */
const VOLUNTARY_SALE_DAILY = 1 / 360;
const NEED_CASH = 0.05;

const hash = (a: number, b: number) => (Math.imul(Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b), 0xc2b2ae35) >>> 0) / 0x100000000;

/**
 * Medianoche (dentro de `housingDaily`, sobre el dinero reunido de cada hogar): quien tiene viviendas de sobra vende
 * una si le falta dinero (menos del 5 % del precio) o, de vez en cuando, por gusto. Compra el hogar propietario más
 * rico que pueda pagarla; si ninguno, el Exterior. Devuelve los cambios en viviendas de sobra por hogar.
 */
export function sellSpareHomes(world: World, pool: Map<number, [number, number]>, price: number, day: number, first: Map<number, number>): Map<number, number> {
  const a = world.agents;
  const change = new Map<number, number>();
  for (const [hh, i] of first) {
    const spare = a.spare[i]! + (change.get(hh) ?? 0);
    if (spare <= 0) continue;
    const p = pool.get(hh)!;
    if (!(p[0] < NEED_CASH * price || hash(hh, day + 4099) < VOLUNTARY_SALE_DAILY)) continue;
    let buyer = 0;
    let richest = price;
    for (const [other, j] of first) {
      const q = pool.get(other)!;
      if (other !== hh && a.renting[j] === 0 && a.mortgage[j] === 0 && q[0] >= richest) {
        richest = q[0];
        buyer = other;
      }
    }
    p[0] += price;
    change.set(hh, (change.get(hh) ?? 0) - 1);
    if (buyer !== 0) {
      pool.get(buyer)![0] -= price;
      change.set(buyer, (change.get(buyer) ?? 0) + 1);
    }
    world.emit('home.sold', { seller: a.names[i], buyer: buyer !== 0 ? a.names[first.get(buyer)!] : null, price: Math.round(price) });
  }
  return change;
}

/** Dinero de los miembros de 14+ de cada hogar (sin visitantes). */
function wealthByHousehold(world: World): Map<number, number> {
  const a = world.agents;
  const out = new Map<number, number>();
  for (let i = 0; i < a.count; i++) {
    if (a.occupation[i] === Occupation.Visitor) continue;
    const hh = a.household[i]!;
    out.set(hh, (out.get(hh) ?? 0) + (a.age[i]! >= MONEY_AGE ? a.money[i]! : 0));
  }
  return out;
}

/** Suma `amount` (o lo resta, si es negativo) al dinero de los miembros de 14+ del hogar, en proporción a lo que tienen. */
function credit(world: World, household: number, amount: number, wealth: number): void {
  const a = world.agents;
  let adults = 0;
  for (let i = 0; i < a.count; i++) if (a.household[i] === household && a.age[i]! >= MONEY_AGE) adults++;
  for (let i = 0; i < a.count; i++) {
    if (a.household[i] !== household || a.age[i]! < MONEY_AGE) continue;
    a.money[i]! += wealth > 0 ? (amount * a.money[i]!) / wealth : amount / adults;
  }
}

/**
 * Un hogar propietario que se muda a otro pueblo vende su vivienda (ADR-0039): la compra el hogar propietario sin
 * hipoteca más rico que pueda pagarla (y la tendrá de sobra, para alquilar) o, si ninguno, el Exterior. Con lo cobrado
 * se salda la hipoteca. Devuelve false, sin vender, si la venta no cubre la deuda y el hogar no puede poner el resto.
 */
export function sellHome(world: World, household: number, price: number): boolean {
  const a = world.agents;
  const wealth = wealthByHousehold(world);
  const own = wealth.get(household) ?? 0;
  let seller = -1;
  for (let i = 0; i < a.count; i++) if (a.household[i] === household && (seller < 0 || a.age[i]! > a.age[seller]!)) seller = i;
  if (seller < 0 || a.renting[seller] || own + price < a.mortgage[seller]!) return false;
  const tenants = new Set<number>();
  for (let i = 0; i < a.count; i++) if (a.renting[i] || a.mortgage[i]! > 0) tenants.add(a.household[i]!);
  let buyer = 0;
  let richest = price;
  for (const [hh, w] of wealth) {
    if (hh !== household && !tenants.has(hh) && w >= richest) {
      buyer = hh;
      richest = w;
    }
  }
  let buyerName: string | null = null;
  if (buyer !== 0) {
    credit(world, buyer, -price, richest);
    setHousehold(world, buyer, a.spare, Math.min(255, spareOf(world, buyer) + 1));
    for (let i = 0; i < a.count && buyerName === null; i++) if (a.household[i] === buyer) buyerName = a.names[i]!;
  }
  credit(world, household, price - a.mortgage[seller]!, own);
  for (let i = 0; i < a.count; i++) if (a.household[i] === household) a.mortgage[i] = 0;
  world.emit('home.sold', { seller: a.names[seller], buyer: buyerName, price: Math.round(price) });
  return true;
}

/**
 * Tras mudarse, compra su nueva vivienda (ADR-0039) a un hogar que tenga viviendas de sobra (el que más) o al
 * Exterior: al contado si le llega con un colchón de `buffer`; si no, con hipoteca si tiene para la entrada (`down`)
 * y el colchón. Devuelve false si no puede comprar (entonces alquila).
 */
export function buyHome(world: World, household: number, home: number, price: number, down: number, buffer: number): boolean {
  const a = world.agents;
  const wealth = wealthByHousehold(world);
  const own = wealth.get(household) ?? 0;
  const paid = own >= price + buffer ? price : own >= down + buffer ? down : -1;
  if (paid < 0) return false;
  let seller = 0;
  let most = 0;
  for (let i = 0; i < a.count; i++) {
    if (a.household[i] !== household && a.spare[i]! > most) {
      most = a.spare[i]!;
      seller = a.household[i]!;
    }
  }
  if (seller !== 0) {
    setHousehold(world, seller, a.spare, most - 1);
    credit(world, seller, price, wealth.get(seller) ?? 0);
  }
  credit(world, household, -paid, own);
  let name = '';
  for (let i = 0; i < a.count; i++) {
    if (a.household[i] !== household) continue;
    a.renting[i] = 0;
    a.landlord[i] = 0;
    a.arrears[i] = 0;
    a.mortgage[i] = price - paid;
    if (!name) name = a.names[i]!;
  }
  world.emit('home.bought', { home: world.map.buildings[home]!.id, name, price: Math.round(price), mortgage: Math.round(price - paid) });
  return true;
}
