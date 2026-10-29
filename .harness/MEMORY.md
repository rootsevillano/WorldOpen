# MEMORY — WorldOpen

Memoria persistente del Orchestrator. Visión, decisiones vigentes y lecciones aprendidas.
Las decisiones detalladas viven en `DECISIONS/` (ADR); aquí solo el resumen y el porqué.

## 1. Visión (Fase 0, respondida el 2026-10-29)

- **Qué es:** simulación social/urbana autónoma (mezcla de sandbox "Modo Dios" y herramienta de estudio "¿qué pasa
  si…?"). El mundo evoluciona a partir de **criterios iniciales**; algunos cambian solos (clima, estaciones) y otros los
  introduce el **administrador ("Dios")** con una herramienta dedicada. → ADR-0010.
- **Público:** el usuario y un círculo cercano. Los invitados **solo observan** (usuario + contraseña); solo el
  administrador introduce criterios/comandos. → ADR-0006.
- **Tono:** realista contemporáneo + histórico con evolución temporal; preparado para un futuro ruleset fantástico.
- **Línea roja (innegociable):** **nada real identificable**. Personas, negocios, calles y el propio pueblo son ficticios.
  El mapeado se basa en Almensilla, pero el producto **nunca** muestra ese nombre ni nombres reales. → ADR-0007.
  Nombre ficticio provisional del pueblo: **"Valdeolivo"** (configurable en el manifiesto del mundo).
- **Emergencia que valida el MVP:** (1) ciclo diario casa↔trabajo↔ocio; (2) reacción colectiva a un evento divino
  (huida/refugio); (3) un recurso escaso provoca colas o desplazamientos.
- **Licencia:** MIT para el código; los datos derivados conservan sus licencias (ODbL, CC BY 4.0, Catastro).

## 2. Alcance del MVP

- Hasta **2 000** humanos ficticios (Fase 2: 5), arquitectura pensada para **10 000** (ECS sobre TypedArrays + LOD de simulación).
- Necesidades: hambre, energía, cobijo/seguridad, social, trabajo (0–1). Rasgos: edad, sexo, sociabilidad,
  laboriosidad, valentía, salud, ocupación, hogar. Población fija; memoria acotada; relaciones con afinidad −1..1.
- Estructuras colectivas: solo hogares/familias.
- IA: Utility AI (qué) + FSM/BT pequeños (cómo). **Sin LLM** en el MVP (ni siquiera narrativo). → ADR-0008.
- Tiempo: 1 tick = 1 min de juego (**parametrizable**), 1× = 1 tick/s (**velocidad variable**); día/noche, estaciones,
  clima simple. Determinismo estricto. → ADR-0003, ADR-0009.
- Economía: recursos sin dinero (comida, agua, madera); agricultura en rústico/olivar; "Exterior" abstracto en
  salidas de carretera.
- Modo Dios MVP: inspeccionar, seguir, tiempo, crear/eliminar agentes, incendio, ola de calor. Todo es un **Comando**
  con registro versionado (alta/baja de comandos). → ADR-0005.
- Edificios indestructibles en el MVP, pero el estado del edificio vive en el motor para permitir geometría dinámica después.
- Mapa: término municipal completo para render; agentes en el casco. Datos vía **map-pack** versionado generado
  por `almensilla-3d` (que sigue siendo repo independiente). → ADR-0007.
- Plataforma: escritorio, Chromium/Firefox. Cámara cenital/órbita. UI: HUD + paneles plegables (React).

## 3. Preparado para fases posteriores (no implementar aún, pero no cerrar la puerta)

| Requisito futuro | Cómo lo preparamos |
|---|---|
| Mundo que vive con la pestaña cerrada (servidor) | Motor agnóstico del host (Worker, Node, servidor) tras `EngineHost`/protocolo de mensajes. ADR-0002 |
| Histórico de mundos y visor de estudio/replay | Event sourcing: manifiesto + log de comandos + snapshots, `worldId`, `WorldStore`. ADR-0004 |
| Usuarios invitados con contraseña | Roles en el sobre del comando (`admin`/`observer`); auth real llega con el servidor. ADR-0006 |
| Más localidades en el mapa | El mundo referencia **varias regiones** de map-packs con un CRS global común. ADR-0007 |
| Tick de otra duración | `minutesPerTick` en el manifiesto; nada asume 1 min. ADR-0009 |
| Edificios destructibles | Estado lógico por edificio en el motor; el render indexa edificios por id. |
| Ruleset fantástico / época histórica | Rulesets como módulos de contenido registrables. ADR-0010 |
| Narración con LLM | Solo fuera del bucle, consumiendo el log de eventos. ADR-0008 |

## 4. Gobernanza

- Git: el Orchestrator hace **commits locales por tarea**; el usuario hace `push`. (P4 = B)
- Revisiones del usuario: al final de cada fase y ante decisiones 🔒. (O3 = A + C)
- Quality Gates: unit → integration → behavior (headless, estadístico, varias seeds) → visual. Local (`npm run gate:*`)
  y en GitHub Actions. → ADR-0011.

## 5. Lecciones aprendidas

- (2026-10-29) `almensilla-3d`: coordenadas EPSG:25829, origen `E0=755870, N0=4132708`, ejes glTF X=Este, Y=arriba,
  Z=−Norte. Los viales son superficies, **no grafo**: hay que derivar grafo + rejilla de navegación en su pipeline.
- (2026-10-29) Las funciones trascendentes de `Math` (`sin`, `cos`, `exp`, `pow`…) no están garantizadas bit a bit
  entre motores JS (V8 vs SpiderMonkey). El motor solo usa `+ − × ÷ sqrt` y aproximaciones propias. ADR-0003.
- (2026-10-29) TypeScript 7 (compilador nativo) se usa solo para `typecheck`; Vite/Vitest/tsx transpilan.
