import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Con WORLDOPEN_SERVER=http://127.0.0.1:8787 el servidor de desarrollo redirige la API y los sockets (modo servidor). */
const target = process.env.WORLDOPEN_SERVER;

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    port: 5180,
    strictPort: true,
    ...(target ? { proxy: { '/api': target, '/ws': { target, ws: true } } } : {}),
  },
});
