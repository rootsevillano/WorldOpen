# STATE — estado de la implementación

_Actualizado: 2026-10-29 (cierre de la Fase 5: servidor)_

## Implementado

| Pieza | Ruta | Estado |
|---|---|---|
| Servidor | `apps/server`, `packages/host` | Mundo vivo compartido, usuarios scrypt, sesiones, límite de intentos, `/ws/live` y `/ws/study`, guardado cada 30 s y comandos al instante (ADR-0016) |
| Visor de estudio | `engine/src/study.ts`, `apps/web/src/ui/study/`, host | Replay, saltos, análisis por hora con verificación, línea de tiempo con intervenciones, gráficas, CSV (ADR-0015) |
| Contratos TS | `packages/contracts/src` | Protocolo **v4**, motor **0.4.0** (replay, seek, analyze, timeline, series); antes v3: frames con estados de edificio, inspector (`AgentDetail`, `BuildingDetail`, `EconomySummary`), `load`/`end`, snapshot con edificios |
| Mapa sintético | `engine/src/map/synthetic.ts` | 5×5 manzanas; viviendas, tiendas, servicios públicos (fuentes), aserradero y huertas en la corona |
| Agentes | `engine/src/world/agents.ts`, `engine/src/agents/` | 35 columnas: rasgos, ocupación y puesto, 6 necesidades + salud, carga, memoria (8 recuerdos), relaciones (8 huecos), puntuaciones de la última decisión |
| Utility AI | `engine/src/agents/systems.ts` | Stay, GoHome, GoOut, SeekShelter, Sleep, **Provision**, **Work** |
| Economía | `engine/src/agents/economy.ts` | Comida, agua, leña; producción, importaciones, agua corriente, calefacción, colas (ADR-0012) |
| Social | `engine/src/agents/social.ts` | Familia al crear; charlas por hora en locales → amistades; memoria de fuentes vacías e incendios |
| Desastres | `engine/src/agents/disasters.ts` | `disaster.fire`: evacuación, testigos, dañado 2 días, refugio en servicio público si arde tu casa |
| Inspector | `engine/src/inspect.ts` | Agente (necesidades, puntuaciones, memoria, relaciones), edificio (existencias, cola), economía |
| WorldStore | `packages/store`, `cli/src/fileStore.ts` | Memoria, IndexedDB, ficheros; batería de conformidad común (ADR-0013) |
| Host | `packages/host/src/hostCore.ts` | Guarda cada día, al pausar, al terminar, al cambiar de mundo y (opcional) por tiempo real; comandos al log al aplicarse; `load`; replay |
| Render | `packages/render` | Selección por clic, anillo de selección, seguir agente, edificios en llamas/dañados, colores por actividad |
| UI | `apps/web/src/ui` | HUD con economía, panel de Mundos (crear/abrir/ver/terminar), Inspector (seguir, incendiar), Modo Dios |
| CLI | `packages/cli` | `simulate --save/--end`, `worlds`, `verify`, `study` (CSV), métricas económicas, referencias `@uso[n]`, `events.<tipo>` |

## Gates (última ejecución: 2026-10-29)
- Typecheck ✅ · Unit + Integration ✅ 101 tests (incluye 10 de servidor con HTTP/WebSocket reales: acceso, bloqueo,
  origen, roles, suplantación, enrutado de respuestas, visor privado, reanudación, web estática)
- Behavior ✅ 8/8: `daily-cycle`, `heatwave-shelter`, `food-scarcity`, `water-cut`, `house-fire`, `survival-5`,
  `tick-duration`, `world-alive`
- Perf ✅ 2 000 agentes × 10 000 ticks en 6.3 s (≈ 1 580 ticks/s; objetivo ≥ 20)
- Extremo a extremo (Fase 5) ✅ servidor real + web compilada: acceso de observadora (sin Modo Dios ni tiempo), visor
  privado verificado mientras el mundo seguía, administrador con Modo Dios; parada brusca → comando conservado,
  snapshots cada ~30 s, `verify` idéntico; modo local intacto.
- Visual (Fase 4) ✅ 1100×820 y 1500×900: visor con 4 intervenciones, «replay verificado 7/7», saltos por marcador
  (incendio visible en T+1), cruz/tooltip, salir del estudio, aviso claro al abrir un mundo del motor 0.3.0.
- Visual ✅ (1400×850): selección e inspector de tienda y vecina, incendio en rojo, seguir con cámara, histórico
  (pausa → recarga → mismo tick; terminar → solo lectura; crear nuevo), 2 000 habitantes a ≈ 560 ticks/s en el Worker.
  FPS no medidos (el panel del navegador estaba oculto).

## Comportamiento observado (200 agentes)
- Laborable: ~70 % trabajando a mediodía, 4–7 % de ocio; a las 17:00 sube el ocio; de noche 100 % en casa durmiendo.
- Ola de calor: ocio 0 todo el día; solo se camina al trabajo o a casa.
- Escasez de comida: tiendas vacías el día 1, cientos/miles de visitas a tiendas vacías, colas, el trabajo cae
  (40 %→5 %) y la salud se desploma; algunos desisten al recordar que todas las tiendas están vacías.
- Corte de agua: despensas a la baja, consumo de fuentes; daño limitado en la salud (0.81–1).
- Incendio de una casa: evacuación inmediata, sus residentes duermen en un servicio público, la casa vuelve a usarse.

## No implementado
- Map-pack real (`almensilla-3d`), comparación de mundos en el visor, varios mundos vivos por servidor, gestión de usuarios en la web, ciclo de vida
  (nacimientos/muertes), vehículos/animales, logística con agentes, LOD de simulación (ADR-0014).
