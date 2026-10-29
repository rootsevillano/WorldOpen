/**
 * atan2 determinista (ADR-0003: `Math.atan2` no está garantizado bit a bit entre motores JS).
 * Aproximación polinómica de atan en [0, 1] con error máximo ≈ 1e-5 rad; solo aritmética básica.
 */
const PI = 3.141592653589793;
const HALF_PI = PI / 2;

function atanUnit(t: number): number {
  const t2 = t * t;
  return t * (0.99997726 + t2 * (-0.33262347 + t2 * (0.19354346 + t2 * (-0.11643287 + t2 * (0.05265332 + t2 * -0.0117212)))));
}

export function atan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let r = ax >= ay ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}

/** Rumbo del contrato de render (0 = +X, positivo hacia −Z = Norte) para un desplazamiento (dx, dz). */
export function headingOf(dx: number, dz: number): number {
  return atan2(-dz, dx);
}
