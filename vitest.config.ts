import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    // Los tests de simulación (días enteros, snapshots) corren en paralelo: 5 s por defecto se queda corto en máquinas cargadas.
    testTimeout: 30_000,
  },
});
