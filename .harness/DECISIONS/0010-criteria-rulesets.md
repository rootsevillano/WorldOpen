# ADR-0010 · Criterios del mundo y rulesets

**Estado:** Aceptada · 2026-10-29 · Fuente: V1, V3

## Contexto
El mundo evoluciona a partir de **criterios iniciales**. Algunos cambian solos (clima) y otros los introduce Dios con una
herramienta. Debe admitir épocas (contemporánea, histórica) y en el futuro un ruleset fantástico.

## Decisión
- **Criterio** = parámetro con nombre, tipo, rango y valor por defecto, declarado por el motor o por un ruleset
  (`CriterionDefinition { key, type, min?, max?, options?, default, description, mutableBy: 'admin' | 'system' | 'both' }`).
  Ejemplos: `climate.baseTemperature`, `economy.foodScarcity`, `society.sociability`.
- Los criterios iniciales van en el manifiesto; los cambios posteriores son el comando `criteria.set` (queda en el log,
  así el visor de estudio muestra cuándo y cómo cambió cada parámetro). Los sistemas automáticos (clima) cambian los suyos
  con eventos internos deterministas.
- La **herramienta de criterios** (UI de Dios) se genera desde el catálogo `listCriteria` + `listCommands`.
- **Ruleset** = módulo de contenido registrable (`contemporary`, `historical`, en el futuro `fantasy`) que aporta
  criterios, comandos, ocupaciones, recursos y acciones de la IA. El manifiesto declara el ruleset del mundo.
  El MVP solo trae `contemporary`.

## Consecuencias
- Añadir una época/fantasía no toca el núcleo: es otro ruleset.
