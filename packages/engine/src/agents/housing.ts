import { ticksPerDay } from '../time/clock';
import type { World } from '../world/world';
import { MONEY_AGE, RENT_PER_DAY, rentIndex, rentNow } from './money';

/**
 * Propietarios y vivienda (ADR-0026). El alquiler lo cobra un hogar del pueblo (su casero) o un fondo de fuera
 * (`landlord` = 0). Un hogar de alquiler con ahorros para la entrada compra su vivienda con hipoteca: el casero cobra el
 * precio entero (el banco pone el resto) y el hogar paga cada día una cuota hasta saldarla. Las decisiones se derivan
 * de un hash (hogar, día): no consumen el PRNG.
 */

/** Precio de una vivienda: 20 años de alquiler base (× nivel de precios × índice de ocupación; no × `rentLevel`). */
const PRICE_RENT_DAYS = 20 * 360;
/** Entrada con crédito normal; `economy.creditAccess` la divide (0 = sin hipotecas: se paga entera). */
const DOWN_PAYMENT = 0.1;
/** Cuota diaria de hipoteca: el 80 % del alquiler base actual. */
const MORTGAGE_SHARE = 0.8;
/** Probabilidad diaria de comprar si se puede (≈ en un año) y colchón que se guarda además de la entrada. */
const BUY_DAILY = 1 / 360;
const BUY_BUFFER_RENT_DAYS = 60;
/** Alquileres iniciales con casero del pueblo (el resto, fondos de fuera). */
const LOCAL_LANDLORDS = 0.6;
/** Edad mínima del mayor del hogar para ser casero al crear el mundo (segunda vivienda heredada o comprada). */
const LANDLORD_AGE = 45;

const hash = (a: number, b: number) => (Math.imul((a * 2654435761) ^ (b * 40503), 0x9e3779b1) >>> 0) / 0x100000000;

export function housePrice(world: World): number {
  return RENT_PER_DAY * world.num('economy.priceLevel') * rentIndex(world) * PRICE_RENT_DAYS;
}

/** Parte del precio que se paga de entrada (1 = al contado). */
export function downPaymentShare(world: World): number {
  const credit = world.num('economy.creditAccess');
  return credit <= 0 ? 1 : Math.min(1, DOWN_PAYMENT / credit);
}

function mortgagePayment(world: World): number {
  return MORTGAGE_SHARE * RENT_PER_DAY * world.num('economy.priceLevel') * rentIndex(world);
}

/** Al crear el mundo: un 60 % de los hogares de alquiler paga a un hogar propietario del pueblo con algún mayor de 45. */
export function seedLandlords(world: World): void {
  const a = world.agents;
  const oldest = new Map<number, number>();
  const renters = new Set<number>();
  for (let i = 0; i < a.count; i++) {
    const hh = a.household[i]!;
    oldest.set(hh, Math.max(oldest.get(hh) ?? 0, a.age[i]!));
    if (a.renting[i]) renters.add(hh);
  }
  const owners = [...oldest].filter(([hh, age]) => !renters.has(hh) && age >= LANDLORD_AGE).map(([hh]) => hh);
  if (owners.length === 0) return;
  const landlordOf = new Map<number, number>();
  for (const hh of renters) {
    if (hash(hh, 1) < LOCAL_LANDLORDS) landlordOf.set(hh, owners[Math.floor(hash(hh, 2) * owners.length)]!);
  }
  for (let i = 0; i < a.count; i++) a.landlord[i] = landlordOf.get(a.household[i]!) ?? 0;
}

/**
 * Un hogar nuevo de alquiler: si un hogar propietario del pueblo puede pagar una vivienda entera, el más rico la compra
 * (al Exterior) y es su casero; si no, es de un fondo de fuera.
 */
export function assignLandlord(world: World, household: number): void {
  const a = world.agents;
  const price = housePrice(world);
  const wealth = new Map<number, number>();
  const tenants = new Set<number>();
  for (let i = 0; i < a.count; i++) {
    if (a.renting[i] || a.mortgage[i]! > 0) tenants.add(a.household[i]!);
    if (a.age[i]! >= MONEY_AGE) wealth.set(a.household[i]!, (wealth.get(a.household[i]!) ?? 0) + a.money[i]!);
  }
  let best = 0;
  let bestWealth = price;
  for (const [hh, w] of wealth) {
    if (hh !== household && !tenants.has(hh) && w >= bestWealth) {
      best = hh;
      bestWealth = w;
    }
  }
  if (best !== 0) {
    // Paga la vivienda a partes iguales con el dinero de sus miembros de 14+.
    const share = price / bestWealth;
    for (let i = 0; i < a.count; i++) if (a.household[i] === best && a.age[i]! >= MONEY_AGE) a.money[i]! -= a.money[i]! * share;
    world.emit('home.investment', { household: best, price: Math.round(price) });
  }
  for (let i = 0; i < a.count; i++) if (a.household[i] === household) a.landlord[i] = best;
}

/**
 * Medianoche, sobre el dinero ya reunido de cada hogar (`pool`): alquileres (al casero o fuera), cuotas de hipoteca y
 * compras. Devuelve los hogares que no han podido pagar (impago).
 */
export function housingDaily(world: World, pool: Map<number, [number, number]>): Set<number> {
  const a = world.agents;
  const rent = rentNow(world);
  const payment = mortgagePayment(world);
  const price = housePrice(world);
  const down = price * downPaymentShare(world);
  const day = Math.floor(world.tick / ticksPerDay(world.time));
  const unpaid = new Set<number>();
  const first = new Map<number, number>();
  /** Hogar → deuda hipotecaria tras comprar hoy; hogar → cuota pagada hoy. */
  const purchases = new Map<number, number>();
  const payments = new Map<number, number>();
  for (let i = 0; i < a.count; i++) {
    const hh = a.household[i]!;
    if (first.has(hh)) continue;
    first.set(hh, i);
    const p = pool.get(hh)!;
    if (a.renting[i]) {
      // Si el casero ya no está en el pueblo, el piso es de un fondo de fuera.
      const landlord = pool.get(a.landlord[i]!);
      if (p[0] < rent) unpaid.add(hh);
      const paid = Math.min(Math.max(0, p[0]), rent);
      p[0] -= paid;
      if (landlord) landlord[0] += paid;
      // Compra de su vivienda: entrada del hogar y el resto del banco; el casero cobra el precio entero.
      if (p[1] > 0 && p[0] >= down + BUY_BUFFER_RENT_DAYS * rent && hash(hh, day) < BUY_DAILY) {
        p[0] -= down;
        if (landlord) landlord[0] += price;
        purchases.set(hh, price - down);
      }
    } else if (a.mortgage[i]! > 0) {
      const due = Math.min(a.mortgage[i]!, payment);
      if (p[0] < due) unpaid.add(hh);
      const paid = Math.min(Math.max(0, p[0]), due);
      p[0] -= paid;
      payments.set(hh, paid);
    }
  }
  for (let i = 0; i < a.count; i++) {
    const hh = a.household[i]!;
    if (a.renting[i] && a.landlord[i] !== 0 && !pool.has(a.landlord[i]!)) a.landlord[i] = 0;
    const debt = purchases.get(hh);
    if (debt !== undefined) {
      a.renting[i] = 0;
      a.landlord[i] = 0;
      a.mortgage[i] = debt;
      a.arrears[i] = 0;
    }
    const paid = payments.get(hh);
    if (paid !== undefined) a.mortgage[i] = a.mortgage[i]! - paid < 0.01 ? 0 : a.mortgage[i]! - paid;
  }
  for (const [hh, debt] of purchases) {
    const i = first.get(hh)!;
    world.emit('home.bought', { home: world.map.buildings[a.home[i]!]!.id, name: a.names[i], price: Math.round(price), mortgage: Math.round(debt) });
  }
  for (const hh of payments.keys()) {
    const i = first.get(hh)!;
    if (a.mortgage[i] === 0) world.emit('mortgage.paidOff', { home: world.map.buildings[a.home[i]!]!.id, name: a.names[i] });
  }
  return unpaid;
}
