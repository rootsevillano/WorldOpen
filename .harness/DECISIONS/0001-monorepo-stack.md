# ADR-0001 · Monorepo TypeScript con npm workspaces

**Estado:** Aceptada · 2026-10-29 · Fuente: P1, P2

## Contexto
El motor debe ejecutarse en un Web Worker y en Node (CLI headless) con el mismo código, y más adelante en un servidor.
El render reutiliza el trabajo de `almensilla-3d` (Three.js vanilla). La UI necesita paneles ricos.

## Decisión
- Monorepo con **npm workspaces**, Node 24, todo en **TypeScript** (ESM).
- Paquetes:
  - `packages/contracts` — tipos y constantes compartidos (fuente de verdad de los contratos). Sin dependencias.
  - `packages/engine` — motor puro: sin DOM, sin Three.js, sin Node APIs. Solo depende de `contracts`.
  - `packages/render` — adaptador Three.js que consume `RenderFrame`. Sin React, sin lógica de simulación.
  - `packages/cli` — `worldopen` para Node (simulate, gates).
  - `apps/web` — Vite + React (UI) + Worker host + `render`.
- Versiones exactas (sin `^`): three 0.186.1, vite 8.3.5, react 19.3.1, typescript 7.0.2, vitest 5.0.5, tsx 4.23.15.
- Los paquetes exportan su `src/*.ts` directamente (resolución `bundler`); `tsc` solo hace `typecheck` (`noEmit`).

## Consecuencias
- Un único `npm ci` instala todo. Las fronteras entre paquetes son las fronteras de los contratos.
- El núcleo usa TypedArrays (ECS) para poder portarse a Rust/WASM si el rendimiento lo exige, sin cambiar contratos.
- Un test de pureza impide que `engine` importe DOM, Node o Three.js.
