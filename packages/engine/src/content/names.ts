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
const TOWN_START = ['l', 'v', 'm', 'r', 't', 'n', 's', 'b', 'c', 'f', 'g', 'p'];
const TOWN_CLUSTER = ['br', 'tr', 'cl', 'pr', 'gr'];
const TOWN_VOWEL = ['a', 'e', 'i', 'o', 'u', 'a', 'o'];
const TOWN_MID = ['l', 'r', 'n', 's', 'd', 'b', 'm', 't', 'ñ', 'z'];
const TOWN_MID_DOUBLE = ['ll', 'rr', 'nd', 'st', 'rd', 'lm'];
const TOWN_END = ['ar', 'illa', 'ejo', 'al', 'ares', 'uela', 'era', 'ino', 'eda', 'ones', 'ilo', 'osa', 'ena', 'ales'];
const TOWN_PREFIX = ['Val', 'Villa', 'Torre', 'Fuente', 'Casti', 'Monte', 'Navalo', 'Cabe'];
const TOWN_OF = ['del Campo', 'de la Sierra', 'del Río', 'de Arriba', 'de Abajo', 'del Monte', 'de la Vega', 'del Pinar'];

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

/** Nombre de pueblo inventado (ADR-0036). */
export function townName(rng: Rng): string {
  // Raíz pronunciable: consonante inicial, vocal, consonante intermedia y una terminación de topónimo (ADR-0037).
  // Un solo grupo de consonantes por nombre (nada de «Prirreda»); con prefijo, sin grupo inicial.
  const r = rng.nextFloat();
  const prefixed = r < 0.25;
  const cluster = !prefixed && rng.nextFloat() < 0.25;
  const start = cluster ? pick(rng, TOWN_CLUSTER) : pick(rng, TOWN_START);
  const mid = !cluster && !prefixed && rng.nextFloat() < 0.3 ? pick(rng, TOWN_MID_DOUBLE) : pick(rng, TOWN_MID);
  const core = start + pick(rng, TOWN_VOWEL) + mid + pick(rng, TOWN_END);
  if (prefixed) return pick(rng, TOWN_PREFIX) + core;
  if (r < 0.45) return `${capitalize(core)} ${pick(rng, TOWN_OF)}`;
  return capitalize(core);
}
