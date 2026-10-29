# STATE — estado de la implementación

_Actualizado: 2026-10-29 (cierre de la Fase 1)_

## Implementado

| Pieza | Ruta | Estado |
|---|---|---|
| Contratos TS | `packages/contracts/src` | Protocolo v1, RenderFrame, comandos, criterios, manifiesto, snapshot (con comandos pendientes), WorldStore (interfaz), map-pack v1 (esquema) |
| PRNG determinista | `engine/src/math/rng.ts` | sfc32 + splitmix32, estado serializable |
| Hash de estado | `engine/src/math/hash.ts` | FNV-1a 32 bits |
| Reloj de juego | `engine/src/time/clock.ts` | `minutesPerTick` parametrizable, calendario 12×30, estaciones |
| Criterios | `engine/src/criteria/registry.ts` | Definición, valores iniciales, validación por rol |
| Comandos | `engine/src/commands/` | Registro versionado con estados active/deprecated/removed; `criteria.set` v1 |
| Ruleset | `engine/src/rulesets/contemporary.ts` | 4 criterios; sin sistemas todavía |
| Agentes (almacén) | `engine/src/world/agents.ts` | SoA sobre TypedArrays, capacidad 10 000. **Sin IA ni comandos de alta** |
| Simulación | `engine/src/simulation.ts` | step, submit, log, snapshot/restore, replay, frame, catálogo |
| Host del motor | `apps/web/src/engine-host/` | `EngineHostCore` (agnóstico) + Web Worker + `EngineClient` |
| Render | `packages/render` | Suelo sintético, agentes instanciados, sol por hora/estación |
| UI | `apps/web/src/ui` | HUD, control del tiempo, Modo Dios (criterios desde el catálogo), log de eventos |
| CLI | `packages/cli` | `worldopen simulate`, `worldopen gate behavior` |
| CI | `.github/workflows/ci.yml` | Gates 0–3 + build |

## Gates (última ejecución: 2026-10-29)
- Typecheck: ✅ (TS 7.0.2, 5 proyectos)
- Unit + Integration: ✅ 41 tests (engine: rng, reloj, comandos, pureza, determinismo/snapshot/replay; web: protocolo del host)
- Behavior: ✅ 2/2 (`world-alive` 5 seeds × 3 días; `tick-duration` 10 min/tick)
- Visual: ✅ app en http://localhost:5180 sin errores de consola; criterios aplicados desde el panel aparecen en el log;
  60× mide 60 ticks/s; máx ≈ 1.1 M ticks/s (mundo vacío).
- Headless: 10 000 ticks en ≈ 2 ms (mundo vacío). El objetivo de rendimiento real se mide con agentes (Fase 2).

## No implementado (pendiente)
- Agentes con necesidades/IA, map-pack real, WorldStore (IndexedDB/ficheros), comandos del Modo Dios del MVP,
  inspector/seguir, roles con login (fase servidor).

## Cómo ejecutar
`npm install` · `npm run dev` · `npm run simulate -- --ticks 10000` · `npm run gate:all`
