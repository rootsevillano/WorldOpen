# ADR-0033 · Hostal y turismo

**Estado:** Aceptada · 2026-11-01 · Amplía ADR-0032 · Fuente: decisión del usuario

## Decisión
1. **Bar-hostal:** la tienda más cercana a la parada del autobús (en un pueblo pequeño, el bar de la plaza) alquila
   habitaciones: una por cada 25 m² construidos (mín. 4), 35 la noche × `economy.priceLevel`, que entran en su caja. No
   se crea un edificio nuevo ni se quita vivienda a nadie.
2. **Temporada y criterio:** los visitantes por autobús se multiplican por la temporada (×2 de junio a agosto, ×0,5 de
   diciembre a febrero) y por `society.tourism` (nuevo, 0–3, 1).
3. **Huéspedes:** al bajar del autobús, un visitante se aloja 1–3 noches con probabilidad 30 % × `society.tourism`
   (hasta 1) si quedan habitaciones; trae más dinero (150–350). De día sigue el programa de visita (ADR-0032); a las
   21:00 paga la noche (si no puede, se va como visitante de paso) y va a dormir al hostal; a las 08:30 se levanta con
   una noche menos y, tras la última, se va en un autobús de ese día.
4. **Huéspedes a medianoche:** los sistemas diarios no los ven: no nacen, mueren ni envejecen aquí; no forman parejas,
   emigran ni cuentan en el censo de hogares; no entran en alquileres, compras de vivienda ni perros. Sus sorteos usan
   su propio PRNG: no mueven el del mundo.
5. Métricas `tourism.guests`, `tourism.occupancy`, `agents.dayVisitors`; HUD "Hostal x/y huéspedes"; inspector del
   edificio con sus habitaciones. Protocolo v10 (`EconomySummary.hostal`, `BuildingDetail.lodging`). Motor 0.21.0.

## Consecuencias
- Dos semanas, mapa sintético (400 habitantes, hostal de 16 habitaciones): en verano 325 visitantes y 85 huéspedes
  (lleno); en invierno 86 y 22 (máx. 8). Mapa real (2 000, 89 habitaciones): en verano 1 620 visitantes, 463
  huéspedes, lleno. Sin efectos en la salud ni en la vida de los vecinos.
- El escenario `commute` ya no exige "0 visitantes a medianoche" sino "0 visitantes de paso" (`agents.dayVisitors`).
- "Visitantes hoy" cuenta la jornada de servicio (el día del mundo empieza a las 06:00; no hay autobuses de 22:00 a
  07:00).
- Pendiente: precio de la habitación según ocupación, casas rurales en viviendas vacías, turismo en fiestas.
