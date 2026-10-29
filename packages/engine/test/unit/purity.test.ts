import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** ADR-0001 / ADR-0003: el motor no usa DOM, Node, Three.js, tiempo real ni funciones no deterministas. */
const SRC = fileURLToPath(new URL('../../src', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const FORBIDDEN: [RegExp, string][] = [
  [/Math\.random/, 'Math.random (usar Rng)'],
  [/\bDate\b/, 'Date (tiempo real)'],
  [/\bperformance\b/, 'performance (tiempo real)'],
  [/\bset(Timeout|Interval)\b/, 'temporizadores (los gestiona el host)'],
  [/Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|pow|cbrt|hypot)\b/, 'Math trascendente (no determinista entre motores)'],
  [/\*\*/, 'operador ** (usa pow)'],
  [/from ['"](three|react|node:|fs|path)/, 'import de render/UI/Node'],
  [/\b(window|document|self|globalThis)\./, 'globales del host'],
];

describe('Pureza del motor', () => {
  const sources = files(SRC);

  it('hay fuentes que revisar', () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  for (const [pattern, label] of FORBIDDEN) {
    it(`no usa ${label}`, () => {
      const offenders = sources.filter((f) => {
        // Se ignoran los comentarios para permitir documentar las prohibiciones.
        const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        return pattern.test(code);
      });
      expect(offenders).toEqual([]);
    });
  }
});
