import type { Rng } from '../math/rng';

/**
 * Nombres inventados a partir de sílabas (línea roja V5): no se usan listas de nombres reales, así que ningún
 * personaje, calle o negocio coincide con una persona o lugar real identificable.
 */
const ONSETS = ['l', 'v', 'm', 'r', 't', 'n', 's', 'd', 'b', 'c', 'f', 'g', 'br', 'tr', 'cl', 'nd', 'rv', 'ls'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ia', 'ea', 'io'];
const FIRST_END_F = ['a', 'ia', 'ena', 'ira', 'ela', 'una'];
const FIRST_END_M = ['o', 'en', 'ar', 'iel', 'on', 'us'];
const LAST_END = ['ández', 'ell', 'ora', 'añez', 'ín', 'ero', 'aldo', 'uela', 'ón'];
const STREET_KIND = ['Calle', 'Calle', 'Calle', 'Avenida', 'Paseo', 'Callejón'];

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[rng.int(0, list.length - 1)]!;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function stem(rng: Rng, syllables: number): string {
  let s = '';
  for (let i = 0; i < syllables; i++) s += pick(rng, ONSETS) + pick(rng, VOWELS);
  return s;
}

/** Nombre y apellido ficticios. `sex`: 0 = mujer, 1 = hombre. */
export function personName(rng: Rng, sex: number): string {
  const first = stem(rng, rng.int(1, 2)) + pick(rng, sex === 0 ? FIRST_END_F : FIRST_END_M);
  const last = stem(rng, rng.int(1, 2)) + pick(rng, LAST_END);
  return `${capitalize(first)} ${capitalize(last)}`;
}

export function streetName(rng: Rng): string {
  return `${pick(rng, STREET_KIND)} ${capitalize(stem(rng, rng.int(2, 3)))}`;
}
