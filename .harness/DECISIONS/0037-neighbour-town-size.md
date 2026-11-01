# ADR-0037 · Pueblos vecinos de tamaño real, nombres naturales y lado elegible

**Estado:** Aceptada · 2026-11-01 · Amplía ADR-0036 · Fuente: decisión del usuario

## Decisión
1. **Tamaño:** cada vecino sintético tiene entre el 35 % y el 80 % (según la semilla) de las viviendas del primer
   pueblo. Se elige el menor número de manzanas por lado (3–24) que llega a esa cifra y se guarda en el manifiesto
   (`RegionRef.blocks`, opcional; por defecto 5). La población inicial se reparte por viviendas, así que los
   vecinos de un mapa real ya no se quedan en ~100 habitantes.
2. **Lado:** `TownSide` = este (por defecto), oeste, norte, sur o alrededor (este, oeste, norte, sur por turnos). Cada
   vecino se coloca a `TOWN_GAP_M` (1,5 km) del borde libre de su lado. La web lo pide al crear un mundo de varios
   pueblos; el escenario `towns` usa «alrededor».
3. **Carretera comarcal:** cada pueblo se une con el **más cercano de los anteriores**, no con el anterior: con
   vecinos a ambos lados, la carretera no atraviesa el primer pueblo.
4. **Nombres:** raíz pronunciable (consonante, vocal, consonante, terminación de topónimo), a veces con prefijo
   (Val-, Villa-, Torre-…) o con complemento («del Campo», «de la Sierra»…). Como mucho un grupo de consonantes
   por nombre, y nunca repite el del primer pueblo ni el de otro vecino. Siguen siendo inventados (ADR-0007).
5. **API:** `neighbourTowns({seed, count, bounds, dwellings, side, taken})`, `countDwellings`, `syntheticBounds`.
   Para dimensionar con un mapa real, la web descarga los edificios del map-pack. Motor 0.25.0; el protocolo no
   cambia.

## Consecuencias
- En el navegador, Valdeolivo con 2 vecinos alrededor y 1500 habitantes: 572 · 460 · 468, sin errores.
- Con la misma población total, el primer pueblo tiene menos vecinos que antes, porque los otros pueblos son más
  grandes.
- 18/18 en ambos mapas; 170 tests.
- Pendiente: pueblos vecinos a partir de otros map-packs reales, y que la gente se mude de un pueblo a otro.
