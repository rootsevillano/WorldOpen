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
  render los interpola desde su posición del frame anterior. `pick` devuelve `{ kind: 'animal', id }` para un animal
  visible (ADR-0029).
- Paradas (protocolo v17, ADR-0045): `busStopCount`, `busStopPositions` (f32 × 3), `busStopHeadings`; marquesina
  en la acera. `AgentFlag.Jammed` (4): coche en un atasco de la carretera comarcal (luces de freno). Durante la romería, quien está en la ermita sale en el frame
  sin `Indoors` y colocado en la pradera de alrededor (ADR-0049). `AgentFlag.Costumed` (8):
  disfrazado en carnaval (ADR-0048); se deriva al construir el frame y el render lo pinta de colores vivos.
- Fiestas (protocolo v16, ADR-0044): `pasoCount`, `pasoPositions` (f32 × 3), `pasoHeadings` (paso de cada
  procesión en curso; el render lo interpola) y `fireworkCount`, `fireworkSites` (f32 × 3, plazas con fuegos; el
  render anima las chispas con su propio reloj).
- Autobuses (protocolo v7; desde ADR-0031, interurbanos): `busCount`, `busPositions` (f32 × 3), `busHeadings`; el
  autobús entra por la carretera del borde, para en el centro y se va. Quien está fuera del pueblo va `Indoors`.
- Mapa: el render pide `query {map}` (lista de `MapLogic`) al recibir `ready`. Sin GLB, dibuja edificios como volúmenes
  (lado = √superficie, altura = plantas × 3 m, color por uso) y calles como franjas por tramo.
- Varios pueblos (ADR-0036): `query {map}` añade un `MapLogic` `comarcal` sin edificios (la carretera entre pueblos,
  ids de nodo negativos). Con un mapa real, los pueblos sin huellas (sintéticos) y la carretera se dibujan como
  volúmenes y franjas junto a la geometría real (render mixto).
- Los buffers se **transfieren** (no se copian): el motor crea arrays nuevos por frame y deja de usarlos al enviarlos.
- El render interpola entre los dos últimos frames emparejando por `agentId` (los índices pueden cambiar al borrar agentes).
- La iluminación usa `frame.date.minuteOfDay` y la estación (sol de la latitud real del mapa).
- Edificios (G3): `buildingStates` (u8, `BuildingState`: en uso, ardiendo, dañado) indexado como `MapLogic.buildings`
  concatenado por región. El render recolorea la instancia (rojo = ardiendo, gris oscuro = dañado). Con geometría
  dinámica (fase posterior) se sustituirá la malla del mismo índice.
- Selección: `WorldRenderer.pick(x, y)` devuelve el agente (en la calle) o el edificio bajo el puntero; `follow(id)`
  mueve el foco de la cámara con el agente interpolado.
