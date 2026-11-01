# ADR-0032 · Visitantes como agentes

**Estado:** Aceptada · 2026-11-01 · Amplía ADR-0031 · Fuente: decisión del usuario

## Decisión
1. **Agentes de paso:** cada autobús trae visitantes (1,5 por cada 1 000 vecinos, el doble en fin de semana) que son
   agentes reales: ocupación `visitor`, sin hogar en el pueblo (su "casa" es el local de la parada, hogar 0), 18–75
   años, 30–90 de dinero. Sus rasgos y su nombre salen de un PRNG propio sembrado por hash (día, minuto, orden): no
   alteran el PRNG del mundo.
2. **Programa de visita** (en el sistema de transporte, no en la Utility AI): van a uno de los 8 locales más cercanos a la
   parada (por hash), pasan ≈ 45 min en cada uno (gastan como el ocio de los vecinos en las tiendas y charlan con quien
   esté), y a su hora (1–4 h después de llegar, como tarde el último autobús) vuelven a la parada y se van en el
   siguiente autobús. Quien siga en el pueblo tras el último autobús se va igualmente. Al irse, los vecinos olvidan la
   relación (`visitor.arrived`, `visitor.left`; el registro de eventos no los muestra).
3. **Aislados de la vida del pueblo:** no deciden con la Utility AI, no tienen necesidades, no comen de despensas, no
   entran en el reparto de dinero del hogar; a medianoche no queda ninguno (los sistemas diarios no los ven). Las
   métricas de población (`agents.count`, proporciones, medias, dinero, parejas, hogares) son solo de vecinos; nueva
   `agents.visitors`. El HUD separa "habitantes" y "de visita".
4. Se retira el gasto abstracto de visitantes en la tienda de la parada (ahora gastan ellos).
5. **Ganado × abundancia de comida** (`economy.foodAbundance` / 0,7): sin pasto ni pienso no produce. Sin esto, en
   `food-scarcity` las entregas de huevos y leche dejaban comida en alguna tienda (el cambio del orden de los sorteos
   lo destapó en una semilla del mapa real).
6. Protocolo v9 (`EconomySummary.bus.visitorsNow`). Motor 0.20.0.

## Consecuencias
- Una semana: 78 visitantes en el mapa sintético (400) y 405 en el real (2 000); a media tarde, 10–21 a la vez en el
  real; todos se van (ninguno a las 22:00).
- El escenario `commute` exige visitantes a mediodía, ninguno a medianoche y que se vayan. 16/16 en ambos mapas.
- Pendiente: que los visitantes compren comida o se queden a dormir (hostal), turismo estacional.
