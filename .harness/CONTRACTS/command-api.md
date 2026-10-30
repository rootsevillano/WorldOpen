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
| `disaster.fire` | 1 | active | admin | `{ buildingId }` | Incendio 3 h (ocupantes huyen, existencias a 0, testigos lo recuerdan) → dañado 2 días → en uso; emite `fire.started`, `fire.ended`, `building.repaired` | Fase 3 |

La ola de calor y el corte de agua se expresan como `criteria.set` (`climate.baseTemperatureC`, `economy.waterSupply`).
En un mundo terminado (`ended`) el host rechaza cualquier comando con `read_only`.
Inspeccionar, seguir y el control del tiempo **no** son comandos (no mutan el mundo): son queries y controles del host.

## Criterios del ruleset `contemporary`

| Clave | Tipo | Rango | Defecto | Mutable por |
|---|---|---|---|---|
| `climate.baseTemperatureC` | number | −10 … 50 | 18 | both |
| `economy.foodAbundance` | number | 0 … 1 | 0.7 | admin |
| `economy.priceLevel` | number | 0.25 … 4 | 1 | admin |
| `economy.rentLevel` | number | 0 … 10 | 1 | admin |
| `economy.wageLevel` | number | 0.25 … 4 | 1 | admin |
| `economy.waterSupply` | number | 0 … 1 | 1 | admin |
| `economy.welfare` | number | 0 … 3 | 1 | admin |
| `society.carOwnership` | number | 0 … 1 | 0.75 | admin |
| `society.emigration` | number | 0 … 5 | 1 | admin |
| `society.fertility` | number | 0 … 5 | 1 | admin |
| `society.immigration` | number | 0 … 5 | 1 | admin |
| `society.mortality` | number | 0 … 5 | 1 | admin |
| `society.sociability` | number | 0 … 1 | 0.5 | admin |
| `society.initialPopulation` | number | 0 … 10000 | 5 | system (solo en el manifiesto) |
| `world.era` | enum | contemporary, historical | contemporary | admin |

## Alta y baja de comandos
1. Alta: definir en `packages/engine/src/commands/` o en un ruleset, con tests, y añadir fila aquí.
2. Cambio de payload: nueva `version`; la anterior queda `deprecated` o se traduce.
3. Baja: `status: 'removed'`. **No se borra el código** mientras haya mundos guardados que lo usen (replay).
