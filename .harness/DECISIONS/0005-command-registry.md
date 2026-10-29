# ADR-0005 · Comandos con registro versionado

**Estado:** Aceptada · 2026-10-29 · Fuente: G2

## Contexto
Todo poder del Modo Dios es un comando serializable. Se irán **añadiendo y eliminando** comandos según surjan
necesidades, y los logs antiguos deben seguir siendo reproducibles.

## Decisión
- Sobre: `CommandEnvelope { id, type, version, issuer, atTick?, payload }`.
- `CommandRegistry` en el motor. Cada definición declara: `type` (`dominio.accion`), `version`, `status`
  (`active` | `deprecated` | `removed`), `authority` (roles que pueden emitirlo), `description`, `validate(payload)`
  y `apply(world, payload)`.
- Reglas:
  - `active`: se acepta y se aplica.
  - `deprecated`: se acepta con aviso; aparece marcado en la herramienta de Dios.
  - `removed`: se **rechaza** si llega nuevo, pero se **sigue aplicando** al reproducir un log antiguo (replay).
    Por eso un comando nunca se borra del código mientras existan mundos que lo usen; solo cambia de estado.
  - Cambiar el payload de un comando = nueva `version`; la antigua se mantiene o se traduce con un *upcaster*.
- El catálogo de comandos (`listCommands`) se publica a la UI: la herramienta de criterios se construye a partir de él.
- Los comandos rechazados no entran en el log; se informa con `commandRejected`.

## Consecuencias
- Añadir un poder = registrar una definición + tests; no hay cambios de protocolo.
- `CONTRACTS/command-api.md` mantiene el catálogo humano.
