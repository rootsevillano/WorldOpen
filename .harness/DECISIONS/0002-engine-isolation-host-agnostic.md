# ADR-0002 · Motor aislado y agnóstico del host

**Estado:** Aceptada · 2026-10-29 · Fuente: master prompt §2, T6

## Contexto
La simulación debe ir separada del hilo de render, poder ejecutarse sin gráficos (CLI) y, en una fase posterior,
seguir viva en un servidor con la pestaña cerrada.

## Decisión
- El motor (`Simulation`) es una clase pura y **síncrona**: `step(n)` avanza ticks; no conoce relojes reales ni hilos.
- El **host** decide el ritmo y el transporte:
  - `apps/web/src/worker` — host Web Worker: bucle por velocidad, publica `RenderFrame` por `postMessage` (buffers transferibles).
  - `packages/cli` — host Node: ejecuta tan rápido como pueda.
  - (futuro) host servidor: mismo motor + `WorldStore` persistente + transporte WebSocket con el **mismo protocolo**.
- Toda comunicación sigue el **Simulation Protocol** (`CONTRACTS/simulation-api.md`): mensajes serializables,
  sin referencias compartidas. El render nunca lee el estado del motor; solo recibe frames.

## Consecuencias
- Pasar a servidor es cambiar el transporte, no el motor.
- La pausa y la velocidad son del host y no forman parte del estado (no afectan al determinismo).
