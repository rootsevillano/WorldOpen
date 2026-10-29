# ADR-0013 · La persistencia vive en el host del motor

**Estado:** Aceptada · 2026-10-29 · Fuente: T5, T6, ADR-0004

## Contexto
Hay que guardar el histórico de mundos en el navegador (MVP) y, más adelante, en un servidor con el mundo vivo con la
pestaña cerrada.

## Decisión
- El `WorldStore` lo usa el **host del motor** (`EngineHostCore`), no la UI: guarda el log nuevo + snapshot + estado
  cada día de juego, al pausar y al terminar. En el navegador corre dentro del Web Worker con IndexedDB; en el CLI con
  ficheros; en la fase servidor será el mismo host con una base de datos.
- Paquete `@worldopen/store` con los adaptadores `MemoryWorldStore` e `IndexedDbWorldStore` y una **batería de
  conformidad** común (`@worldopen/store/conformance`) que también supera `FileWorldStore` (CLI).
- Protocolo v3: `load {worldId}` y `end`; `EngineStatus` informa de `worldStatus`, `readOnly` y `savedTick`.
- Las escrituras se serializan en una cadena de promesas; el tramo del log a añadir se calcula al ejecutar cada
  escritura (evita duplicados con guardados encadenados).
- La UI lee la lista de mundos directamente de IndexedDB (mismo origen) y pide al Worker que los abra.

## Consecuencias
- `worldopen verify <worldId>` reproduce un mundo guardado y compara cada snapshot diario: base del visor de estudio.
- Un mundo `ended` se abre en solo lectura: el host rechaza comandos (`read_only`) y la UI oculta tiempo y Modo Dios.
