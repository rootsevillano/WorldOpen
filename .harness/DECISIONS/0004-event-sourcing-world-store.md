# ADR-0004 · Event sourcing e histórico de mundos

**Estado:** Aceptada · 2026-10-29 · Fuente: T5, T6

## Contexto
El usuario quiere poder empezar y terminar mundos y conservarlos todos, identificados, para reproducirlos más
adelante en un **visor de estudio** con todos los parámetros que se fueron dando.

## Decisión
Un mundo es: **`WorldManifest` + `CommandLog` + `Snapshot`s periódicos**.
- `WorldManifest`: `worldId`, nombre, fecha de creación, `engineVersion`, `seed`, modelo de tiempo, regiones de mapa
  (map-packs con versión), ruleset y **criterios iniciales**. Inmutable.
- `CommandLog`: comandos **aceptados** con el tick en que se aplicaron (append-only).
- `Snapshot`: estado serializado + hash cada N ticks, para saltar rápido en el replay.
- Ciclo de vida: `created → running ⇄ paused → ended`. Un mundo terminado se conserva (solo lectura).
- `WorldStore` es una interfaz (`CONTRACTS/world-store.md`) con adaptadores:
  MVP → IndexedDB (navegador) y ficheros (CLI); futuro → base de datos en servidor. El formato se decidirá con el
  visor de estudio, pero el modelo de datos queda fijado aquí.
- `worldId` lo genera el host (fuera del motor, no afecta al determinismo).

## Consecuencias
- Reproducir un mundo = cargar manifiesto + aplicar el log desde el snapshot más cercano.
- El log debe poder leerse con versiones futuras del motor → comandos versionados (ADR-0005) y `engineVersion` en el
  manifiesto (un replay exacto requiere la misma versión del motor).
