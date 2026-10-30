# STATE — estado de la implementación

_Actualizado: 2026-10-30 (salarios y alquileres)_

## Implementado

| Pieza | Ruta | Estado |
|---|---|---|
| Mapa real | `almensilla-3d/tools/gis/{build_logic,pack_map}.py`, `engine/src/map/mappack.ts`, `cli/src/mappacks.ts`, `render/src/realMap.ts` | Map-pack anonimizado «Valdeolivo» (2 793 edificios, grafo de 2 119 nodos), lector validador, resolvedores (fetch/disco), render con huellas, terreno, viales, árboles y cotas (ADR-0017) |
| Servidor | `apps/server`, `packages/host` | Mundo vivo compartido, usuarios scrypt, sesiones, límite de intentos, `/ws/live` y `/ws/study`, guardado cada 30 s y comandos al instante (ADR-0016) |
| Visor de estudio | `engine/src/study.ts`, `apps/web/src/ui/study/`, host | Replay, saltos, análisis por hora con verificación, línea de tiempo con intervenciones, gráficas, CSV (ADR-0015) |
| Contratos TS | `packages/contracts/src` | Protocolo **v4**, motor **0.12.0** (0.12: salarios de mercado y alquileres; 0.11: precios dinámicos por tienda y aserradero; 0.10: dinero, empleo y precios; inspector con dinero y caja; 0.9: capacidad de almacén y caducidad; 0.8: hogares, parejas y migración; snapshot con `nextHousehold`; 0.7: ciclo de vida y economía sostenible; 0.6: hogares, edades, cronotipos, reparto de cosechas; 0.5: trabajo y ocio cercanos) (replay, seek, analyze, timeline, series); antes v3: frames con estados de edificio, inspector (`AgentDetail`, `BuildingDetail`, `EconomySummary`), `load`/`end`, snapshot con edificios |
| Mapa sintético | `engine/src/map/synthetic.ts` | 5×5 manzanas; viviendas, tiendas, servicios públicos (fuentes), aserradero y huertas en la corona |
| Agentes | `engine/src/world/agents.ts`, `engine/src/agents/` | 35 columnas: rasgos, ocupación y puesto, 6 necesidades + salud, carga, memoria (8 recuerdos), relaciones (8 huecos), puntuaciones de la última decisión |
| Utility AI | `engine/src/agents/systems.ts` | Stay, GoHome, GoOut, SeekShelter, Sleep (cronotipo), Provision, Work (trabajo o escuela), **Deliver** (ADR-0018) |
| Salarios y alquileres | `engine/src/agents/money.ts`, `households.ts` | Salario por negocio (fichajes, subidas y bajadas), reapertura con capital de fuera; alquiler por ocupación, impagos y desahucios; criterio `economy.rentLevel` (ADR-0024) |
| Precios | `engine/src/agents/money.ts` (`updatePrices`) | Multiplicador de precio por tienda y aserradero según existencias frente a demanda, con inercia; elección de tienda por precio y distancia (ADR-0023) |
| Dinero y empleo | `engine/src/agents/money.ts` | Monederos y cajas, precios fijos, jornal diario, Estado y Exterior, contratación y despido semanal, demanda de las tiendas; criterios `economy.priceLevel`, `economy.wageLevel`, `economy.welfare` (ADR-0022) |
| Almacenes | `engine/src/agents/economy.ts` | Capacidad por superficie (huertas y aserraderos se detienen llenos, reparto solo a tiendas con hueco), caducidad diaria de la comida, importaciones 7/persona/día (ADR-0021) |
| Hogares | `engine/src/agents/households.ts` | Hogar explícito por agente, parejas, convivencia, emancipación, emigración e inmigración a viviendas libres; criterios `society.immigration` y `society.emigration` (ADR-0020) |
| Ciclo de vida | `engine/src/agents/lifecycle.ts` | Cumpleaños y etapas, embarazos (270 días) y nacimientos, muertes por edad y por hambre, duelo; criterios `society.fertility` y `society.mortality` (ADR-0019) |
| Población | `engine/src/agents/population.ts` | Por hogares sobre viviendas catastrales, pirámide de edades, estudiantes y niños, cronotipos (ADR-0018) |
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
- Salarios y alquileres ✅ Behavior 15/15 en ambos mapas (nuevo `housing-crisis`); 135 tests; 18 meses sin hambre.
- Precios dinámicos ✅ Behavior 14/14 en ambos mapas; 132 tests; comida 0,94–1,06× en un año normal, ≈ 1,43× con escasez.
- Dinero y empleo ✅ Behavior 14/14 en ambos mapas (nuevo `money-crisis`); 130 tests; un año sin hambre en ambos mapas.
- Almacenes y caducidad ✅ Behavior 13/13 en ambos mapas; 123 tests; existencias acotadas en 14 meses sin hambre.
- Hogares y migración ✅ Behavior 13/13 en mapa sintético y real (nuevo `households-year`); 120 tests.
- Ciclo de vida ✅ Behavior 12/12 en mapa sintético y real (nuevo `lifecycle-year`); 115 tests; 2 años sin hambrunas.
- Calibración ✅ Behavior 11/11 en mapa sintético y real (nuevos: `sleep-schedule`, `households`, `harvest-delivery`);
  110 tests; 6 000 habitantes en el mapa real ≈ 185 ticks/s; 2 000 ≈ 590 ticks/s.
- Fase 2b ✅ `npm run gate:real`: Behavior 8/8 sobre el mapa real; 2 000 agentes × 10 000 ticks en 16 s (616 ticks/s).
  `almensilla-3d`: 43 tests (9 del map-pack). Visual: pueblo real con habitantes, selección e incendio de edificio real.
- Typecheck ✅ · Unit + Integration ✅ 106 tests (incluye 10 de servidor con HTTP/WebSocket reales: acceso, bloqueo,
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
- Escala real (6 000, mapa real): 24 % menores, 20 % 65+; a las 21:00 duerme ~10 %, a medianoche todos en casa, a la
  01:00 todos dormidos; a las 08:00 la mayoría ya levantada; los agricultores reparten cosechas durante el día.
- Laborable: ~70 % trabajando a mediodía, 4–7 % de ocio; a las 17:00 sube el ocio; de noche 100 % en casa durmiendo.
- Ola de calor: ocio 0 todo el día; solo se camina al trabajo o a casa.
- Escasez de comida: tiendas vacías el día 1, cientos/miles de visitas a tiendas vacías, colas, el trabajo cae
  (40 %→5 %) y la salud se desploma; algunos desisten al recordar que todas las tiendas están vacías.
- Corte de agua: despensas a la baja, consumo de fuentes; daño limitado en la salud (0.81–1).
- Incendio de una casa: evacuación inmediata, sus residentes duermen en un servicio público, la casa vuelve a usarse.

## No implementado
- Ortofoto en el map-pack, comparación de mundos en el visor, varios mundos vivos por servidor, gestión de usuarios en la web, divorcios,
 vehículos/animales, logística con agentes, LOD de simulación (ADR-0014).
