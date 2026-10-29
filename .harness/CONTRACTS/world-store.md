# World Store (histórico de mundos)

Código: `packages/contracts/src/store.ts`, `manifest.ts`, `snapshot.ts`. Decisión en ADR-0004.

- **Mundo = manifiesto + log de comandos + snapshots.** El manifiesto es inmutable; el log, append-only.
- Snapshot cada `1440 / minutesPerTick` ticks (un día de juego) y al pausar/cerrar.
- Reproducir el tick T: `getSnapshot(worldId, T)` → `Simulation.restore` → aplicar `readCommands(worldId, snapshot.tick)`
  y avanzar hasta T. Debe dar el mismo `hash` que la ejecución original (Integration Gate).
- Estados: `created → running ⇄ paused → ended`. Un mundo `ended` no acepta comandos ni snapshots nuevos.
- Adaptadores previstos: `IndexedDbWorldStore` (web, MVP), `FileWorldStore` (CLI, MVP: carpeta por `worldId` con
  `manifest.json`, `commands.jsonl`, `snapshots/<tick>.json`), `ServerWorldStore` (fase servidor).
- **Pendiente** (implementación en el MVP, no en Fase 1): los adaptadores. El formato definitivo se cerrará junto al visor de estudio.
