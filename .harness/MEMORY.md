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
- (2026-10-29) El snapshot debe incluir los comandos aceptados aún no aplicados (`pendingCommands`); si no, un mundo
  restaurado los pierde. Al restaurar con log, se deduplican por `envelope.id`.
- (2026-10-29) Fase 2 con mapa sintético por decisión del usuario. Calibración de la Utility AI (tasas por minuto de
  juego en `engine/src/agents/systems.ts`): hay que medir con la sonda de métricas por hora antes de fijar umbrales
  de Behavior Gates; con 5 agentes las proporciones instantáneas son muy ruidosas → escenarios de 200 agentes.
- (2026-10-29) En el navegador integrado, con el panel oculto, `requestAnimationFrame` no corre: verificar el render
  con capturas (fuerzan el pintado), no con contadores actualizados en el bucle de render.
- (2026-10-29) El registro de consola del navegador integrado no se limpia al recargar: para el Visual Gate, contar
  errores nuevos con un listener `error` instalado tras la recarga.
- (2026-10-29) Tras añadir un paquete del workspace con `npm run dev` en marcha, el Worker de Vite puede servir módulos
  obsoletos (errores imposibles como `buildings` undefined): reiniciar el servidor de desarrollo.
- (2026-10-29) Eventos `PointerEvent` sintéticos sobre el canvas provocan un error de `setPointerCapture` en
  OrbitControls: es un artefacto de la prueba, no de la app.
- (2026-10-29) Fase 3: los Behavior Gates se calibran midiendo primero (sondas por hora) y redactando la afirmación
  que los datos sostienen; dos hipótesis iniciales eran demasiado fuertes (corte de agua "sin daño", escasez "nadie
  trabaja") y se reformularon. Las existencias iniciales deben escalar con la población, no con el número de tiendas.
- (2026-10-29) Persistencia: con escrituras encadenadas, calcular el tramo del log al ejecutar cada escritura.
- (2026-10-29) Fase 4: el visor detectó que el hash incluía la cola de comandos pendientes (en replay contiene comandos
  futuros aún no enviados en el original) → falsos fallos de verificación. Lección: un hash de verificación debe cubrir
  solo el estado observable del mundo. Los tests de replay deben enviar comandos *a mitad de partida*, no al inicio.
- (2026-10-29) Un comando aplicado en el tick T solo se ve en T+1: saltar a un marcador lleva a T+1.
- (2026-10-29) Al cambiar de mundo con `init`/`load`/`replay`, el host guarda antes el mundo vivo (si no, se perdía
  el progreso desde el último guardado diario).
- (2026-10-29) Fase 5: parar el servidor desde el panel del navegador (Windows) no envía señal de apagado: la prueba
  real perdió un comando de Dios. Desde entonces los comandos se escriben al aplicarse y el servidor guarda cada 30 s.
  Lección: probar la durabilidad con paradas bruscas, no solo con `close()`.
- (2026-10-29) Banderas de persistencia: no reutilizar `saving` para escrituras del log; en los tests síncronos (sin
  ceder a las microtareas) una bandera compartida bloqueaba los snapshots.
- (2026-10-29) Usuarios de prueba del navegador: credenciales generadas en el scratchpad de la sesión, nunca en el repo.
- (2026-10-30) Fase 2b: las salidas de `almensilla-3d` llevaban rastros reales fuera de los datos visibles (metadatos de
  GLB con el nombre del fichero OSM y el código INE, origen EPSG en árboles, refcat en nodos de edificios). Lección:
  auditar también metadatos y probar que la auditoría detecta lo que debe detectar.
- (2026-10-30) Simplificar cada vía OSM por separado desconectó el grafo (208 componentes): partir en los cruces antes.
- (2026-10-30) Umbrales de Behavior Gates calibrados en la cuadrícula sintética no valían en el mapa real (trayectos de
  hasta 4 km): se cambió el modelo (decaimiento por distancia) y se reformularon las aserciones para medir el
  comportamiento, no valores de una geometría concreta.
- (2026-10-30) Calibración: medir primero a escala real (6 000) destapó problemas invisibles con 200 habitantes (colas
  de madrugada en tiendas cerradas por falta de mostradores y de cierre). Un artefacto propio (el agricultor que
  entrega queda "de ocio" en la tienda) apareció como fallo de un escenario: revisar la métrica antes que el umbral.
- (2026-10-30) Ciclo de vida: simular años destapó hambrunas invisibles en simulaciones de días (fin de semana sin
  cosechas, reparto de importaciones a partes iguales, tope global, bloques de pisos como un solo hogar, atención por
  tick). Lección: probar el modelo a la escala temporal en la que se va a usar. Los ticks de 10 min reproducen los de
  1 min; los de 30–60 min no (discretización de necesidades): para gates de años, 10 min.
- (2026-10-30) Hogares: "mismo edificio" no es "mismo hogar" (bloques de pisos). Al subir ENGINE_VERSION antes de
  registrar criterios nuevos, la recarga en caliente del dev server guardó un mundo sin ellos ("criterio no numérico"):
  registrar criterios y versión en el mismo cambio, o crear un mundo nuevo al verificar.
- (2026-10-30) Un excedente sin límite oculta déficits estacionales: al acotar existencias apareció hambre invernal en el
  mapa real. Al tocar la economía, sondear un año completo (incluido el invierno) en ambos mapas y varias semillas.
- (2026-10-30) Dinero: las cuentas por agente deben cerrar en la semana (se cobra 5 días, se gasta 7) y con la asistencia
  real (250–360 min/jornada), no la nominal. Un agente que "decide pero nunca llega" se detecta trazando acción y
  ubicación tick a tick: la causa fue que se contaba a sí mismo en la penalización de recados del hogar.
- (2026-10-30) Precios: si la decisión ("¿me lo puedo permitir?") y la ejecución ("¿dónde compro?") usan precios
  distintos, aparecen intentos fallidos masivos. Contar eventos de fallo en las sondas largas los delata.
