import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Con WORLDOPEN_SERVER=http://127.0.0.1:8787 el servidor de desarrollo redirige la API y los sockets (modo servidor). */
const target = process.env.WORLDOPEN_SERVER;
const MAP_PACKS = fileURLToPath(new URL('../../data/map-packs', import.meta.url));
const TYPES: Record<string, string> = { '.json': 'application/json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png' };

/** Sirve los map-packs instalados en /map-packs/ (y su índice) durante el desarrollo en modo local (ADR-0017). */
function mapPacks(): Plugin {
  return {
    name: 'worldopen-map-packs',
    configureServer(server) {
      server.middlewares.use('/map-packs', (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
        if (path === '/index.json') {
          const list = existsSync(MAP_PACKS)
            ? readdirSync(MAP_PACKS).filter((d) => existsSync(join(MAP_PACKS, d, 'manifest.json'))).sort()
                .map((d) => JSON.parse(readFileSync(join(MAP_PACKS, d, 'manifest.json'), 'utf8')))
            : [];
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(list));
          return;
        }
        const root = resolve(MAP_PACKS);
        const file = resolve(root, '.' + path);
        if (!file.startsWith(root + sep) || !existsSync(file) || statSync(file).isDirectory()) return next();
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), ...(target ? [] : [mapPacks()])],
  worker: { format: 'es' },
  server: {
    port: 5180,
    strictPort: true,
    ...(target ? { proxy: { '/api': target, '/ws': { target, ws: true }, '/map-packs': target } } : {}),
  },
});
