# World Store (histórico de mundos)

Código: `packages/contracts/src/store.ts`, `manifest.ts`, `snapshot.ts`. Decisión en ADR-0004.

- **Mundo = manifiesto + log de comandos + snapshots.** El manifiesto es inmutable; el log, append-only.
- El snapshot guarda los agentes por columnas (`agents.columns`, en el orden fijo de `AgentStore`; `nextId` y
  `nextHousehold`; con `money` y `workedToday` desde 0.10), nombres y rutas en
  curso, más los comandos aceptados aún pendientes. El mapa no va en el snapshot: se reconstruye del manifiesto.
- Snapshot cada `1440 / minutesPerTick` ticks (un día de juego) y al pausar/cerrar.
- Reproducir el tick T: `getSnapshot(worldId, T)` → `Simulation.restore` → aplicar `readCommands(worldId, snapshot.tick)`
  y avanzar hasta T. Debe dar el mismo `hash` que la ejecución original (Integration Gate).
- Estados: `created → running ⇄ paused → ended`. Un mundo `ended` no acepta comandos ni snapshots nuevos.
- Adaptadores previstos: `IndexedDbWorldStore` (web, MVP), `FileWorldStore` (CLI, MVP: carpeta por `worldId` con
  `manifest.json`, `commands.jsonl`, `snapshots/<tick>.json`), `ServerWorldStore` (fase servidor).
- **Implementado (Fase 3):** `MemoryWorldStore` e `IndexedDbWorldStore` (`@worldopen/store`), `FileWorldStore` (CLI,
  `data/worlds/`). Todos superan `@worldopen/store/conformance`. El snapshot incluye `buildings.columns`
  (existencias, estado, residentes).
- `listSnapshots(worldId)` devuelve ticks y hashes (línea de tiempo y verificación del visor).
- `worldopen verify <worldId>` reproduce el mundo desde el snapshot del tick 0 y compara cada snapshot diario.
