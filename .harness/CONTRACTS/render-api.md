# Render API (Engine → Render)

Código: `packages/contracts/src/frame.ts`. Consumidor: `packages/render/src/WorldRenderer.ts`.

- El render solo conoce `RenderFrame` y, desde la Fase 2, la parte `render/` del map-pack (GLB, árboles, ortofoto).
- Coordenadas del mundo en metros, **X = Este, Y = arriba, Z = −Norte** (las mismas que los GLB de `almensilla-3d`),
  así los modelos existentes se cargan sin transformar.
- Agentes en estructura de arrays: `agentIds` (u32), `agentPositions` (f32 × 3), `agentHeadings` (f32, radianes, 0 = +X,
  positivo hacia −Z = Norte), `agentActivities` (u8, `AgentActivity`).
- Los buffers se **transfieren** (no se copian): el motor crea arrays nuevos por frame y deja de usarlos al enviarlos.
- El render interpola entre los dos últimos frames emparejando por `agentId` (los índices pueden cambiar al borrar agentes).
- La iluminación usa `frame.date.minuteOfDay` y la estación (sol de la latitud real del mapa).
- Edificios (G3): el estado lógico por edificio (incendio, destruido…) llegará como campo nuevo indexado por el id opaco
  del map-pack; el render resaltará/sustituirá la malla correspondiente. No existe aún.
