# ADR-0038 · Mudanzas entre pueblos

**Estado:** Aceptada · 2026-11-01 · Amplía ADR-0020 y ADR-0036 · Fuente: decisión del usuario

## Decisión
Con más de un pueblo, los hogares también se mudan de un pueblo a otro. Lo evalúa el sistema de hogares, a
medianoche.
1. **Por trabajo:** un hogar de alquiler, al corriente de pago, en el que todos los adultos que trabajan lo hacen en
   el mismo pueblo y no es el suyo, se muda allí con probabilidad anual de 0,5. Va a una vivienda libre cerca del
   trabajo; los estudiantes cambian al colegio del pueblo nuevo. Los propietarios no se mudan: tendrían que vender
   antes, y eso queda pendiente.
2. **En vez de irse del mundo:** la mitad de los jóvenes solteros que emigrarían (ADR-0020) se quedan en otro pueblo
   si allí hay casa libre: en el de su trabajo o, si no, en el que tenga más viviendas libres. Alquilan como al
   independizarse.
3. **Criterio** `society.townMigration` (0–10, por defecto 1, admin): multiplica ambas cosas; 0 = ninguna mudanza
   entre pueblos.
4. **Evento** `household.relocated` `{home, size, from, to, reason: 'work' | 'emigration'}`, con una línea en el
   registro de la web. Motor 0.26.0; el protocolo no cambia.
5. En un mundo de un solo pueblo no se hace ningún sorteo nuevo: los escenarios de siempre dan los mismos valores.

## Consecuencias
- Con los valores por defecto las mudanzas son raras: pocos hogares de alquiler trabajan todos fuera. Un mundo de
  800 habitantes ve una o dos al año; con `townMigration` 10, unas dos al mes.
- Nuevo escenario `town-migration`; 19/19 en ambos mapas; 171 tests.
- Pendiente: que los propietarios vendan para mudarse, que se busque trabajo en otro pueblo, y alquileres por pueblo.
