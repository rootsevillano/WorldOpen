/** Hash FNV-1a de 32 bits incremental para comparar estados entre ejecuciones (ADR-0003). */
export class StateHasher {
  private h = 0x811c9dc5;
  private readonly view = new DataView(new ArrayBuffer(8));

  private byte(b: number): void {
    this.h = Math.imul(this.h ^ b, 0x01000193) >>> 0;
  }

  u32(n: number): this {
    const v = n >>> 0;
    this.byte(v & 0xff);
    this.byte((v >>> 8) & 0xff);
    this.byte((v >>> 16) & 0xff);
    this.byte(v >>> 24);
    return this;
  }

  /** Hashea los 8 bytes IEEE-754 del número: dos estados con la misma representación dan el mismo hash. */
  f64(n: number): this {
    this.view.setFloat64(0, n, true);
    for (let i = 0; i < 8; i++) this.byte(this.view.getUint8(i));
    return this;
  }

  str(s: string): this {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.byte(c & 0xff);
      this.byte(c >>> 8);
    }
    return this;
  }

  digest(): number {
    return this.h >>> 0;
  }
}
