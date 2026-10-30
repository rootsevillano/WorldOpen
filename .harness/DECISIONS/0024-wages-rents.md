# ADR-0024 · Salarios de mercado y alquileres

**Estado:** Aceptada · 2026-10-30 · Fuente: E1 (D), ADR-0020, ADR-0022, ADR-0023

## Decisión — salarios
1. **Salario por negocio:** columna `wage` por edificio, multiplicador del jornal base del sector (0,7×–1,5×). Los
   funcionarios siguen con salario fijo del Estado.
2. **Lunes, al contratar:** con gente en paro, contrata a la más cercana (como antes). Sin nadie en paro, si tiene caja
   para 6 semanas de nóminas sube su salario un 2 % y ficha a la persona más cercana que gane al menos un 10 % menos
   en otro negocio (`job.changed`). Con caja para menos de 2 semanas, baja el salario un 5 %; si despide con un paro
   por encima del 10 %, también.
3. **Reapertura:** un negocio sin plantilla no produce ni ingresa, así que nunca reuniría caja para contratar. Si hay
   gente en paro, un inversor de fuera le pone capital para un mes (`business.reopened`).
4. Subir un 5 % semanal sin condiciones desataba guerras salariales entre huertas (hasta 1,8× en tres meses) que en
   invierno acababan en despidos masivos (44 % de paro). Con el 2 %, el límite de caja y el techo de 1,5× se modera.

## Decisión — alquileres
5. **Tenencia:** columna `renting` por agente (todo el hogar igual): 25 % de alquiler en la población inicial y 60 %
   entre los hogares que llegan. Se decide con un hash del id del hogar, sin consumir el PRNG (no cambia la población).
   Quien forma un hogar nuevo (pareja o emancipación) alquila; quien entra en otro hogar adopta su tenencia.
6. **Precio:** 10 al día (≈ 300 al mes) × `economy.priceLevel` × `economy.rentLevel` (nuevo, 0–4) × índice de
   ocupación = 1 + 2 × (hogares / viviendas − 0,9), entre 0,6× y 2,5×. Se calcula del estado: no se guarda.
7. **Impago y desahucio:** se paga a medianoche, antes de la ayuda de emergencia (que solo cubre comida); quien no
   llega paga lo que tiene y suma un día de impago (`arrears`). A los 30 días el hogar es desahuciado y se va del
   pueblo (`household.evicted`, `agent.emigrated` con `reason: eviction`).
8. **Vivienda y migración:** independizarse exige ahorros para 90 días de alquiler; la inmigración se multiplica por
   1 / índice (hasta ×1,5): un pueblo caro atrae menos.
9. Inspector: tenencia, impagos y jornal de cada negocio; HUD: índice de salarios y alquiler diario. Métricas
   `economy.wageIndex`, `economy.rentIndex`, `households.renterRatio`. Motor 0.12.0.

## Consecuencias
- Un año y medio: mapa real con 2 000 habitantes (viviendas de sobra, alquiler 0,6×) con salarios que suben hasta
  1,05× por el paro casi nulo; mapa sintético con despidos de invierno (paro 26 %) y salarios que bajan a 0,91×; sin
  muertes por hambre. Con 1 000 habitantes en el mapa sintético (saturado) el alquiler llega a 2,5×.
- Escenario `housing-crisis` (alquileres ×4, salarios ×0,4, sin bienestar): desahucios y la población a la mitad.
- Pendiente: propietarios locales que cobren los alquileres (ahora van fuera del pueblo), compra de vivienda.
