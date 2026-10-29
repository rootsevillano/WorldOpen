# ADR-0008 · IA simbólica, sin LLM en el bucle

**Estado:** Aceptada · 2026-10-29 · Fuente: S8, S9, master prompt §2

## Decisión
- **Qué hacer:** Utility AI. Cada acción candidata puntúa según necesidades (hambre, energía, cobijo, social, trabajo),
  rasgos y contexto (hora, clima, eventos conocidos). Se elige la mejor con un desempate determinista por PRNG.
- **Cómo hacerlo:** máquinas de estado / behavior trees pequeños por acción (ir a, esperar, consumir, trabajar, huir).
- **GOAP:** reservado para planes multi-paso de la economía, si el Behavior Gate lo pide.
- **Sin LLM** en el MVP. En el futuro, un LLM solo podrá consumir el log de eventos para narrar (crónicas), nunca decidir.
- LOD de simulación: los agentes lejos del foco o sin cambios se evalúan con menos frecuencia (escalonado por índice).

## Consecuencias
- Comportamiento explicable: el inspector muestra las puntuaciones que llevaron a cada decisión.
