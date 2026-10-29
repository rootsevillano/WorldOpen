# ADR-0011 · Quality Gates y CI

**Estado:** Aceptada · 2026-10-29 · Fuente: master prompt §4, O2, P3, P5

## Decisión
| Gate | Qué comprueba | Cómo |
|---|---|---|
| 0 · Typecheck | Tipos de todo el monorepo | `npm run typecheck` |
| 1 · Unit | Módulos aislados (PRNG, reloj, registro…) | `npm run gate:unit` (Vitest) |
| 2 · Integration | Simulación completa: determinismo, snapshot/restore, protocolo | `npm run gate:integration` |
| 3 · Behavior | Escenarios declarativos en `gates/behavior/*.scenario.json` (seed(s), ticks, comandos, **aserciones estadísticas** sobre varias seeds) | `npm run gate:behavior` (CLI headless) |
| 4 · Visual | El render reacciona al motor (frames llegan, HUD avanza, sin errores de consola) | Local, navegador integrado, capturas + métricas |
| Perf | ≥ 60 FPS a 1080p; ≥ 20 ticks/s con 2 000 agentes; 10 000 ticks headless < 60 s | Bench del CLI y `?bench` en la web (desde Fase 2) |

- GitHub Actions ejecuta 0–3 en cada push/PR (`.github/workflows/ci.yml`).
- Una tarea no está terminada hasta superar todos los gates aplicables.
