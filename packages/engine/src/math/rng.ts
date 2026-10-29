/**
 * PRNG determinista (ADR-0003): sfc32 sembrado con splitmix32. Solo operaciones enteras de 32 bits,
 * idénticas en cualquier motor JS. Su estado forma parte del snapshot.
 */
export type RngState = [number, number, number, number];

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  static fromSeed(seed: number): Rng {
    const next = splitmix32(seed);
    const rng = new Rng([next(), next(), next(), next()]);
    // Descarta las primeras salidas para mezclar bien semillas parecidas.
    for (let i = 0; i < 12; i++) rng.nextU32();
    return rng;
  }

  get state(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  nextU32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Real uniforme en [0, 1). */
  nextFloat(): number {
    return this.nextU32() / 4294967296;
  }

  /** Entero uniforme en [min, max] (ambos incluidos). */
  int(min: number, max: number): number {
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }
}
