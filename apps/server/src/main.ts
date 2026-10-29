import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import type { Role } from '@worldopen/contracts';
import { WorldOpenServer } from './server';
import { UserStore } from './users';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const USAGE = `worldopen-server — servidor de WorldOpen (Fase 5)

Uso:
  npm run server -- start [--port 8787] [--host 127.0.0.1] [--data data/server] [--web apps/web/dist] [--tps 1]
  npm run server -- user add <nombre> --role admin|observer     (contraseña: WORLDOPEN_PASSWORD o por teclado)
  npm run server -- user list
  npm run server -- user remove <nombre>
`;

async function readPassword(): Promise<string> {
  if (process.env.WORLDOPEN_PASSWORD) return process.env.WORLDOPEN_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  const p = await rl.question('Contraseña (mín. 10 caracteres): ');
  rl.close();
  return p;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      port: { type: 'string', default: '8787' },
      host: { type: 'string', default: '127.0.0.1' },
      data: { type: 'string', default: `${ROOT}data/server` },
      web: { type: 'string', default: `${ROOT}apps/web/dist` },
      tps: { type: 'string', default: '1' },
      role: { type: 'string' },
      secure: { type: 'boolean', default: false },
    },
  });
  const [cmd, sub, name] = positionals;

  if (cmd === 'user') {
    const users = new UserStore(`${values.data}/users.json`);
    await users.load();
    if (sub === 'list') {
      for (const u of users.list()) console.log(`${u.name.padEnd(20)} ${u.role.padEnd(9)} ${u.createdAt}`);
      return 0;
    }
    if (sub === 'add' && name) {
      const role = values.role as Role;
      if (role !== 'admin' && role !== 'observer') {
        console.error('--role debe ser admin u observer');
        return 2;
      }
      await users.add(name, await readPassword(), role);
      console.log(`Usuario ${name} (${role}) creado.`);
      return 0;
    }
    if (sub === 'remove' && name) {
      console.log((await users.remove(name)) ? `Usuario ${name} eliminado.` : `No existe ${name}.`);
      return 0;
    }
    console.error(USAGE);
    return 2;
  }

  if (cmd === 'start') {
    const server = new WorldOpenServer({
      dataDir: values.data,
      webDir: values.web,
      port: Number(values.port),
      host: values.host,
      ticksPerSecond: Number(values.tps),
      secureCookies: values.secure,
    });
    const addr = await server.start();
    if (server.users.list().length === 0) {
      console.warn('Aviso: no hay usuarios. Crea uno con: npm run server -- user add <nombre> --role admin');
    }
    console.log(`WorldOpen escuchando en http://${addr.address}:${addr.port} (mundo vivo a ${values.tps} ticks/s)`);
    const stop = async () => {
      console.log('Guardando el mundo y deteniendo…');
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', () => void stop());
    process.on('SIGTERM', () => void stop());
    return -1; // sigue vivo
  }

  console.error(USAGE);
  return cmd === undefined ? 0 : 2;
}

const code = await main(process.argv.slice(2));
if (code >= 0) process.exitCode = code;
