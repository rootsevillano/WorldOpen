import { randomBytes } from 'node:crypto';
import type { Role } from '@worldopen/contracts';

export interface Session {
  token: string;
  name: string;
  role: Role;
  expiresAt: number;
}

export const SESSION_COOKIE = 'wo_session';

/** Sesiones en memoria (se pierden al reiniciar el servidor: hay que volver a entrar). */
export class Sessions {
  private readonly byToken = new Map<string, Session>();

  constructor(private readonly ttlMs = 12 * 60 * 60 * 1000, private readonly now: () => number = Date.now) {}

  create(name: string, role: Role): Session {
    const s: Session = { token: randomBytes(32).toString('base64url'), name, role, expiresAt: this.now() + this.ttlMs };
    this.byToken.set(s.token, s);
    return s;
  }

  get(token: string | undefined): Session | null {
    if (!token) return null;
    const s = this.byToken.get(token);
    if (!s) return null;
    if (s.expiresAt <= this.now()) {
      this.byToken.delete(token);
      return null;
    }
    return s;
  }

  delete(token: string | undefined): void {
    if (token) this.byToken.delete(token);
  }

  /** Cierra todas las sesiones de un usuario (p. ej. al darlo de baja). */
  revokeUser(name: string): void {
    for (const [t, s] of this.byToken) if (s.name === name) this.byToken.delete(t);
  }
}

/** Lee una cookie de la cabecera `Cookie`. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Límite de intentos de acceso por IP: tras `maxFailures` fallos en `windowMs`, bloqueo durante `windowMs`.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, { count: number; first: number; blockedUntil: number }>();

  constructor(private readonly maxFailures = 5, private readonly windowMs = 15 * 60 * 1000, private readonly now: () => number = Date.now) {}

  blocked(ip: string): boolean {
    const f = this.failures.get(ip);
    return !!f && f.blockedUntil > this.now();
  }

  fail(ip: string): void {
    const t = this.now();
    const f = this.failures.get(ip);
    if (!f || t - f.first > this.windowMs) {
      this.failures.set(ip, { count: 1, first: t, blockedUntil: 0 });
      return;
    }
    f.count++;
    if (f.count >= this.maxFailures) f.blockedUntil = t + this.windowMs;
  }

  succeed(ip: string): void {
    this.failures.delete(ip);
  }
}
