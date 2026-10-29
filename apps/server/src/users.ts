import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { Role } from '@worldopen/contracts';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

/** Parámetros de scrypt (derivación de claves resistente a fuerza bruta). Nunca se guarda la contraseña. */
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export interface UserRecord {
  name: string;
  role: Role;
  salt: string;
  hash: string;
  createdAt: string;
}

const NAME = /^[a-zA-Z0-9_.-]{3,32}$/;

/** Usuarios del servidor (V2, ADR-0006): `admin` ("Dios") y `observer` (invitados). Fichero JSON con hashes scrypt. */
export class UserStore {
  private users: UserRecord[] = [];
  /** Hash ficticio para que un usuario inexistente tarde lo mismo que uno con contraseña errónea. */
  private readonly dummy = { salt: randomBytes(16).toString('base64'), hash: randomBytes(KEYLEN).toString('base64') };

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    try {
      this.users = (JSON.parse(await readFile(this.path, 'utf8')) as { users: UserRecord[] }).users;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      this.users = [];
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify({ users: this.users }, null, 2) + '\n', { mode: 0o600 });
    await rename(tmp, this.path);
  }

  list(): { name: string; role: Role; createdAt: string }[] {
    return this.users.map(({ name, role, createdAt }) => ({ name, role, createdAt }));
  }

  async add(name: string, password: string, role: Role): Promise<void> {
    if (!NAME.test(name)) throw new Error('Nombre de usuario: 3–32 caracteres (letras, números, _ . -)');
    if (password.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres');
    if (this.users.some((u) => u.name === name)) throw new Error(`El usuario ${name} ya existe`);
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, KEYLEN, SCRYPT);
    this.users.push({ name, role, salt: salt.toString('base64'), hash: hash.toString('base64'), createdAt: new Date().toISOString() });
    await this.persist();
  }

  async remove(name: string): Promise<boolean> {
    const before = this.users.length;
    this.users = this.users.filter((u) => u.name !== name);
    if (this.users.length === before) return false;
    await this.persist();
    return true;
  }

  /** Devuelve el usuario si la contraseña es correcta. Comparación en tiempo constante. */
  async verify(name: string, password: string): Promise<{ name: string; role: Role } | null> {
    const user = this.users.find((u) => u.name === name);
    const salt = Buffer.from(user?.salt ?? this.dummy.salt, 'base64');
    const expected = Buffer.from(user?.hash ?? this.dummy.hash, 'base64');
    const actual = await scrypt(password, salt, KEYLEN, SCRYPT);
    const ok = timingSafeEqual(actual, expected);
    return user && ok ? { name: user.name, role: user.role } : null;
  }
}
