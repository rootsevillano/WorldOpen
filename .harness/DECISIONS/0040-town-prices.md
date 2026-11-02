# ADR-0040 · Precios de la vivienda por pueblo

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0024, ADR-0026 y ADR-0039 · Fuente: decisión del usuario

## Decisión
1. **Índice de alquiler por pueblo** (`townRentIndices`, `rentIndex(world, town)`): es el índice por ocupación de
   ADR-0024 (hogares / viviendas del pueblo, de 0,6× a 2,5×) por un recargo por tamaño. El recargo va de 0,6× a 1×,
   según las viviendas del pueblo frente a las del mayor: los pueblos grandes, con más trabajo y servicios, son más
   caros. Con un solo pueblo es el índice de siempre, y los mundos de un pueblo no cambian.
2. **Se paga al precio del pueblo de la vivienda:**
   - el alquiler diario, la cuota de la hipoteca y la compra de la propia vivienda (`housingDaily`);
   - la compra de un inversor del pueblo (`assignLandlord`);
   - los ahorros que hacen falta para independizarse;
   - al mudarse de pueblo (ADR-0039), se vende al precio del pueblo de origen y se compra al del destino.

   Las viviendas de sobra (ADR-0028) no tienen pueblo: se compran y venden al índice del mundo.
3. Quien se iría del mundo y se queda en otro pueblo (ADR-0038) prefiere el que tenga más viviendas libres por
   unidad de precio.
4. **Métricas** `town.<región>.rentIndex|rent|housePrice`. `EconomySummary.towns` añade `rent` y `housePrice`
   (protocolo v14), y la línea de pueblos del HUD muestra el alquiler de cada uno. Motor 0.28.0.

## Consecuencias
- Valdeolivo con 2 vecinos y 6000 habitantes: alquiler de 6,0, 5,5 y 5,4 al día. Mudarse a un pueblo pequeño deja
  dinero a quien vende en el grande.
- Con la población habitual, la ocupación queda por debajo del 60 % y el índice en su mínimo. La diferencia entre
  pueblos viene entonces solo del tamaño, hasta que se llenen.
- 19/19 en ambos mapas; 175 tests.
- Pendiente: salarios por pueblo y buscar trabajo en otro pueblo.
