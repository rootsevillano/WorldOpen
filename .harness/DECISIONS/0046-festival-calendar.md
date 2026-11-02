# ADR-0046 · Varias fiestas al año, con un calendario por pueblo

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0034, ADR-0035 y ADR-0044 · Fuente: decisión del usuario

## Decisión
1. **Calendario por pueblo** (`fiestas(world, town)`, por prioridad si coinciden):
   - **Fiestas patronales:** verbena cada noche, procesión el día grande a las 12:00 y fuegos la última noche.
     - Primer pueblo: las elige el Modo Dios, como hasta ahora (ADR-0035).
     - Pueblos vecinos: fechas propias derivadas de su región (sin sorteo), de mayo a septiembre, de 3 a 5 días, el
       segundo festivo.
   - **Navidad** (todos los pueblos), del 24 de diciembre al 6 de enero:
     - festivos el 25, el 1 y el 6;
     - verbena en Nochevieja (la noche del 30 de diciembre, último día del año de 360) y fuegos a las 00:00;
     - cabalgata de Reyes el 5 a las 18:00: una procesión con la carroza.
   - **Romería**, un día festivo de abril o mayo, según la región:
     - de 10:00 a 18:00, un 40 % × `society.festivities` de los vecinos de 6 años o más (los niños, con su familia)
       pasa el día en el merendero, el local del pueblo más alejado de la plaza;
     - allí se socializa el doble.
2. **Todo va por pueblo** (`activeFiesta(world, town)`):
   - los festivos, que quitan la jornada y el colegio según el pueblo del trabajo o la escuela (`inShift`, `inSchool`);
   - la verbena y el trasnochar;
   - la procesión y los fuegos;
   - los visitantes de más.

   Las funciones de antes aceptan el pueblo y por defecto usan el primero.
3. **Avisos:** los de fiestas llevan el pueblo y el tipo (`festival.started`, `festival.day` y `festival.ended`, con
   `town` y `kind`).
4. **Resumen** (protocolo v18): `EconomySummary.festival` añade `kind` y `holiday`, y `towns[].festival` dice qué
   fiesta hay en cada pueblo. El HUD muestra «🎉 Fiestas del pueblo», «🌿 Romería» o «🎄 Navidad», y su icono en la
   línea de cada pueblo.
5. **Métricas** `festival.kind`, `festival.holiday`, `festival.towns` y `festival.romeria`. Motor 0.34.0.

## Consecuencias
- **En el navegador:** Nochevieja con verbena a las 22:00 del 30 de diciembre y fuegos en las dos plazas a las 00:10
  del 1 de enero.
- **Fechas:** la romería del primer pueblo (región r1) cae el 27 de mayo. Las patronales de los vecinos del mundo de
  prueba caen el 9 de septiembre y el 9 de agosto.
- **Mundos de un año:** ahora tienen más festivos y verbenas, y sus valores cambian algo.
- **Escenario `procession`:** el vecino ya no tiene fuegos el 18 de agosto, y el escenario lo refleja.
- 24/24 en ambos mapas (nuevos `christmas` y `romeria`); 184 tests.
- **Pendiente:** elegir en el Modo Dios las fechas de la romería y de las patronales de los vecinos, el carnaval, y
  que la romería tenga su ermita en el campo.
