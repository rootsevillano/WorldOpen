# ADR-0003 · Determinismo estricto

**Estado:** Aceptada · 2026-10-29 · Fuente: T4

## Decisión
Misma semilla + mismo manifiesto + mismo log de comandos ⇒ mismo estado, **bit a bit**, en cualquier host.

Reglas del motor (verificadas por `packages/engine/test/purity.test.ts`):
1. Aleatoriedad solo con el PRNG propio (`sfc32` sembrado con `splitmix32`), cuyo estado forma parte del snapshot.
   Prohibido `Math.random`.
2. Sin tiempo real: prohibido `Date`, `performance`, `setTimeout` en `packages/engine`.
3. Prohibidas las funciones trascendentes de `Math` (`sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `hypot`…):
   su precisión no está garantizada entre V8 y SpiderMonkey. Permitidas `+ − × ÷`, `Math.sqrt`, `Math.floor/ceil/round/
   trunc/abs/min/max/imul/fround`. Si hace falta trigonometría, se usan aproximaciones propias (`engine/src/math`).
4. Iteración en orden fijo (índices de array, nunca orden de inserción de `Map`/`Set` con claves dependientes del host).
5. Los comandos se aplican al **inicio** de un tick concreto, en orden de llegada aceptado, y quedan en el log con ese tick.
6. `Simulation.hash()` resume el estado del mundo (FNV-1a de 32 bits) para comparar ejecuciones; no incluye la cola
   de comandos pendientes (ver ADR-0015).

## Consecuencias
- Replays, histórico de estudio y Behavior Gates reproducibles en CI.
- Coste: cuidado extra al escribir lógica; los tests de pureza lo vigilan.
