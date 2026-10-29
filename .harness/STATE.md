# STATE — estado de la implementación

_Actualizado: 2026-10-29 (cierre de la Fase 2 con mapa sintético)_

## Implementado

| Pieza | Ruta | Estado |
|---|---|---|
| Contratos TS | `packages/contracts/src` | Protocolo **v2** (frames con `agentFlags`, `query map`), `MapLogic`, snapshot por columnas, WorldStore (interfaz), map-pack v1 |
| PRNG / hash / atan2 | `engine/src/math/` | sfc32 + splitmix32; FNV-1a; atan2 polinómico determinista (error < 1e-4 rad) |
| Reloj de juego | `engine/src/time/clock.ts` | `minutesPerTick` parametrizable, calendario 12×30, estaciones |
| Criterios y comandos | `engine/src/criteria`, `engine/src/commands` | Registro versionado; `criteria.set`, `agent.spawn`, `agent.remove` |
| Mapa sintético | `engine/src/map/synthetic.ts` | Pueblo ficticio 5×5 manzanas, 100 edificios por uso, calles con nombres inventados |
| Navegación | `engine/src/map/navigation.ts` | `NavMap`: viviendas/locales, A* determinista, rutas edificio→edificio |
| Agentes | `engine/src/world/agents.ts`, `engine/src/agents/` | SoA (17 columnas), población inicial ponderada por viviendas, nombres ficticios; necesidades (energía, cobijo, social); Utility AI (Stay, GoHome, GoOut, SeekShelter, Sleep); movimiento a 75 m/min |
| Entorno | `engine/src/agents/environment.ts` | Noche (rampas lineales), temperatura diaria ±6 °C, incomodidad térmica |
| Host del motor | `apps/web/src/engine-host/` | Worker + `EngineHostCore` + `EngineClient` |
| Render | `packages/render` | Mapa lógico como volúmenes y calles; agentes instanciados, interpolados por id, color por actividad, ocultos bajo techo |
| UI | `apps/web/src/ui` | HUD con población, control del tiempo, Modo Dios (criterios + "Crear habitante"), log con nombres |
| CLI | `packages/cli` | `simulate` (con `--agents`, `--max-ms`, métricas en el informe), `gate behavior` con aserciones en día/hora |

## Gates (última ejecución: 2026-10-29)
- Typecheck ✅ · Unit + Integration ✅ 56 tests
- Behavior ✅ 5/5: `survival-5`, `daily-cycle` (200 agentes), `heatwave-shelter` (200), `tick-duration`, `world-alive`
- Perf ✅ 2 000 agentes × 10 000 ticks en 3.6 s (≈ 2 800 ticks/s; objetivo ≥ 20 ticks/s y < 60 s)
- Visual ✅ mapa, monigotes caminando e interpolados, sin errores de consola (comprobado con 125 habitantes)

## Comportamiento observado (200 agentes, clima por defecto)
- 08:00–18:00: 15–25 % fuera de casa (comercios/servicios), 2–6 % caminando.
- 19:00–21:00: vuelven y se acuestan; de 21:00 a 07:00, 100 % en casa durmiendo.
- Ola de calor (45 °C desde las 08:00): en una hora todos en casa; nadie sale; la necesidad social cae a 0 a las 15:00.

## No implementado
- Map-pack real (depende de `almensilla-3d`), WorldStore (IndexedDB/ficheros), inspector/seguir agente,
  `disaster.fire`, economía (comida/agua/madera), memoria y relaciones, LOD de simulación, auth (fase servidor).
