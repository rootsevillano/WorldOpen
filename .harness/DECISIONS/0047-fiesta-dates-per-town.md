# ADR-0047 · Fechas de fiestas de cada pueblo en el Modo Dios

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0010, ADR-0035 y ADR-0046 · Fuente: decisión del usuario

## Decisión
1. **Criterios por región:** un ruleset puede declarar `regionCriteria(regions)`, criterios que dependen de las
   regiones del manifiesto. Se definen al crear el mundo, antes de leer los valores del manifiesto. Así se guardan en
   el snapshot, entran en el hash, se cambian con `criteria.set` y el Modo Dios los muestra sin código propio.
2. **Fechas por pueblo** (`fiestas.<región>.…`, enteros, `admin`):
   - **Todos los pueblos:** `romeriaMonth` (1–12) y `romeriaDay` (1–30).
   - **Pueblos vecinos:** `patronalMonth` (1–12), `patronalDay` (1–30), `patronalLength` (1–10) y
     `patronalHoliday` (0–10; 0 = ningún festivo ni procesión, como en el primer pueblo).
   - **Primer pueblo:** sus patronales siguen en `society.festival…` (ADR-0035).
   - **Valores por defecto:** las fechas de su región de ADR-0046, así que los mundos sin cambios no cambian.
3. **Nombre en la UI:** `CriterionDefinition.label` es opcional (p. ej. «Cabeporares · romería: mes»). El Modo
   Dios agrupa las fechas de cada pueblo en el desplegable «Fechas de fiestas por pueblo», en orden de lectura.
4. **Versiones:** protocolo v19 (`label` y criterios por región en el catálogo) y motor 0.35.0 (el hash incluye los
   criterios nuevos).

## Consecuencias
- **Cambio en marcha:** un cambio de fecha mueve las fiestas al momento, como con el primer pueblo.
- **Desde el manifiesto:** escenarios y CLI pueden fijar las fechas en `criteria`. Una región que no existe se
  rechaza como criterio desconocido.
- **Gates:** escenario nuevo `fiesta-dates`.
- **Pendiente:** el carnaval y la ermita de la romería en el campo.
