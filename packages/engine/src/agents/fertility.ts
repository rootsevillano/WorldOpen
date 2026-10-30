/** Fecundidad anual por edad de la mujer en pareja (TFR ≈ 1.3, aprox. España): [edad máxima, probabilidad] (ADR-0019). */
export const FERTILITY: [number, number][] = [
  [17, 0], [24, 0.03], [29, 0.07], [34, 0.11], [39, 0.07], [45, 0.015], [255, 0],
];

export function fertilityAt(age: number): number {
  for (const [max, p] of FERTILITY) if (age <= max) return p;
  return 0;
}
