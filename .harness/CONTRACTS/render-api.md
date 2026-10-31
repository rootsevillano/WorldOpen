# Render API (Engine → Render)

Código: `packages/contracts/src/frame.ts`. Consumidor: `packages/render/src/WorldRenderer.ts`.

- El render solo conoce `RenderFrame` y, desde la Fase 2, la parte `render/` del map-pack (GLB, árboles, ortofoto).
- Coordenadas del mundo en metros, **X = Este, Y = arriba, Z = −Norte** (las mismas que los GLB de `almensilla-3d`),
  así los modelos existentes se cargan sin transformar.
- Agentes en estructura de arrays: `agentIds` (u32), `agentPositions` (f32 × 3), `agentHeadings` (f32, radianes, 0 = +X,
  positivo hacia −Z = Norte), `agentActivities` (u8, `AgentActivity`), `agentFlags` (u8, `AgentFlag`; `Indoors` = dentro
  de un edificio: el render no lo dibuja; `Driving` = va en coche: el render dibuja un coche, ADR-0025).
- Animales (protocolo v5, ADR-0027): `animalCount`, `animalIds` (u32), `animalPositions` (f32 × 3), `animalHeadings`,
  `animalKinds` (u8, `AnimalKind`: perro, oveja, gallina) y `animalFlags` (`Indoors` = recogido: no se dibuja). El
  render los interpola desde su posición del frame anterior.
- Mapa: el render pide `query {map}` (lista de `MapLogic`) al recibir `ready`. Sin GLB, dibuja edificios como volúmenes
  (lado = √superficie, altura = plantas × 3 m, color por uso) y calles como franjas por tramo.
- Los buffers se **transfieren** (no se copian): el motor crea arrays nuevos por frame y deja de usarlos al enviarlos.
- El render interpola entre los dos últimos frames emparejando por `agentId` (los índices pueden cambiar al borrar agentes).
- La iluminación usa `frame.date.minuteOfDay` y la estación (sol de la latitud real del mapa).
- Edificios (G3): `buildingStates` (u8, `BuildingState`: en uso, ardiendo, dañado) indexado como `MapLogic.buildings`
  concatenado por región. El render recolorea la instancia (rojo = ardiendo, gris oscuro = dañado). Con geometría
  dinámica (fase posterior) se sustituirá la malla del mismo índice.
- Selección: `WorldRenderer.pick(x, y)` devuelve el agente (en la calle) o el edificio bajo el puntero; `follow(id)`
  mueve el foco de la cámara con el agente interpolado.
