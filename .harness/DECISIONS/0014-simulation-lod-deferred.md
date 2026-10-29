# ADR-0014 · LOD de simulación aplazado

**Estado:** Aceptada · 2026-10-29 · Fuente: S1, P3, ADR-0008

## Contexto
S1 preveía un LOD de simulación (agentes lejanos evaluados con menos frecuencia) para llegar a 2 000–10 000 agentes.

## Decisión
No se implementa por ahora. Medido con toda la economía activa: **2 000 agentes a ≈ 1 600 ticks/s** en Node
(10 000 ticks en 6 s) y **≈ 560 ticks/s** en el Web Worker del navegador; el objetivo es ≥ 20 ticks/s.
Las decisiones ya están escalonadas (cada agente decide cada 15 min de juego, repartidos por id).

Si se implementa, debe ser **determinista**: no puede depender de la cámara (que no forma parte del estado), sino de
criterios internos (p. ej. agentes dormidos o en casa sin cambios se evalúan con menos frecuencia).

## Consecuencias
- Se revisará con el mapa real (miles de nodos de calle: el A* y la elección de fuentes pesarán más) y al pasar de
  2 000 agentes. El gate de rendimiento (`npm run gate:perf`) avisará.
