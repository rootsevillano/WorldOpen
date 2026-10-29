/**
 * Códec del Simulation Protocol para transportes de texto (WebSocket): JSON con los arrays tipados en base64.
 * En el Worker no hace falta (structured clone); el protocolo es el mismo (ADR-0002, ADR-0016).
 */
type Typed = Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array | Float64Array;
const TYPED = { Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array, Float64Array } as const;
type TypedName = keyof typeof TYPED;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encode(msg: unknown): string {
  return JSON.stringify(msg, (_key, value: unknown) => {
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const t = value as Typed;
      return { $typed: t.constructor.name, b64: toBase64(new Uint8Array(t.buffer, t.byteOffset, t.byteLength)) };
    }
    return value;
  });
}

export function decode<T>(text: string): T {
  return JSON.parse(text, (_key, value: unknown) => {
    if (value && typeof value === 'object' && '$typed' in value) {
      const v = value as { $typed: string; b64: string };
      const Ctor = TYPED[v.$typed as TypedName];
      if (!Ctor) throw new Error(`Tipo de array desconocido: ${v.$typed}`);
      const bytes = fromBase64(v.b64);
      return new Ctor(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / Ctor.BYTES_PER_ELEMENT);
    }
    return value;
  }) as T;
}
