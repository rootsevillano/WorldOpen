# ADR-0048 · Carnaval

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0044, ADR-0046 y ADR-0047 · Fuente: decisión del usuario

## Decisión
1. **Fecha:** el carnaval es una fiesta más del calendario de cada pueblo (`kind: 'carnaval'`), de tres días.
   - Por defecto empieza el 12 de febrero en toda la comarca.
   - El Modo Dios lo mueve por pueblo con `fiestas.<región>.carnavalMonth` y `carnavalDay` (ADR-0047).
   - Si coincide con otra fiesta, cuentan antes las patronales y la Navidad.
2. **Los tres días:**
   - **Día 1:** desfile de disfraces a las 17:00, como la procesión: reunión en la plaza, una carroza delante y los
     vecinos en filas.
   - **Días 1 y 2:** baile de disfraces por la noche (la verbena).
   - **Día 3:** el martes de carnaval es festivo.
   - **Fuegos:** ninguno.
   - **Visitantes:** vienen algunos más.
3. **Disfraces:**
   - Mientras dura el carnaval de su pueblo, va disfrazada la mitad de los vecinos de cualquier edad (× `society.festivities`,
     como máximo el 90 %).
   - Quién se disfraza sale de un hash del id, sin sorteo.
   - Se deriva de la fecha, no es estado. El frame lo marca con `AgentFlag.Costumed` (8) y el render pinta a esas
     personas de colores vivos, uno por persona.
4. **Métrica y UI:**
   - Métrica `festival.costumed`.
   - HUD y registro: «🎭 Carnaval».
   - Modo Dios: «carnaval: mes» y «carnaval: día» en el apartado de cada pueblo.
5. **Versiones:** protocolo v20 (bandera nueva y tipo de fiesta) y motor 0.36.0 (criterios nuevos en el hash).

## Consecuencias
- **En el navegador:** a las 17:10 del 12 de febrero se ven las dos carrozas y los vecinos disfrazados en fila; la
  línea de pueblos muestra 🎭.
- **Mundos de un año:** ahora tienen un festivo y dos noches de baile más.
- **Gates:** escenario nuevo `carnival`; 26/26 en ambos mapas; 186 tests.
- **Pendiente:** el entierro de la sardina, los concursos de comparsas y la ermita de la romería en el campo.
