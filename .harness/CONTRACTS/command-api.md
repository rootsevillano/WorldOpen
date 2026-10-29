# Command API (Dios / CLI → Engine)

Código: `packages/contracts/src/commands.ts`, `criteria.ts`; registro en `packages/engine/src/commands/`.
Reglas de ciclo de vida en ADR-0005; roles en ADR-0006; criterios en ADR-0010.

## Sobre
```json
{ "id": "c-0001", "type": "criteria.set", "version": 1,
  "issuer": { "userId": "local", "role": "admin" }, "atTick": 120,
  "payload": { "key": "climate.baseTemperatureC", "value": 38 } }
```

## Catálogo

| Tipo | Ver. | Estado | Autoridad | Payload | Efecto | Desde |
|---|---|---|---|---|---|---|
| `criteria.set` | 1 | active | admin | `{ key, value }` | Cambia un criterio con `mutableBy` admin/both; emite `criteria.changed` | Fase 1 |
| `agent.spawn` | 1 | active | admin | `{ count?: 1–500, homeBuildingId? }` | Crea habitantes ficticios en una vivienda (o al azar ponderado por viviendas); emite `agent.spawned` | Fase 2 |
| `agent.remove` | 1 | active | admin | `{ agentId }` | Elimina un habitante; emite `agent.removed` | Fase 2 |

Previstos para el MVP: `disaster.fire`. La ola de calor ya se expresa como `criteria.set climate.baseTemperatureC`.
Inspeccionar, seguir y el control del tiempo **no** son comandos (no mutan el mundo): son queries y controles del host.

## Criterios del ruleset `contemporary`

| Clave | Tipo | Rango | Defecto | Mutable por |
|---|---|---|---|---|
| `climate.baseTemperatureC` | number | −10 … 50 | 18 | both |
| `economy.foodAbundance` | number | 0 … 1 | 0.7 | admin |
| `society.sociability` | number | 0 … 1 | 0.5 | admin |
| `society.initialPopulation` | number | 0 … 10000 | 5 | system (solo en el manifiesto) |
| `world.era` | enum | contemporary, historical | contemporary | admin |

## Alta y baja de comandos
1. Alta: definir en `packages/engine/src/commands/` o en un ruleset, con tests, y añadir fila aquí.
2. Cambio de payload: nueva `version`; la anterior queda `deprecated` o se traduce.
3. Baja: `status: 'removed'`. **No se borra el código** mientras haya mundos guardados que lo usen (replay).
