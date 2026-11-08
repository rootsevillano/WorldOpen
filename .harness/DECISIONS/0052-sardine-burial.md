# ADR-0052 · Entierro de la sardina

**Estado:** Aceptada · 2026-11-08 · Amplía ADR-0044, ADR-0048 y ADR-0051 · Fuente: decisión del usuario

## Decisión
1. **Cuarto día del carnaval:** el miércoles de ceniza es el entierro de la sardina. No es festivo.
   - Por defecto, el carnaval pasa a ir del 12 al 15 de febrero.
   - Ese día ya no hay disfraces.
2. **Cortejo:** a las 20:00, desde la plaza, por la ruta de la procesión de las fiestas (ADR-0044), con reunión una hora
   antes.
   - La carroza es la sardina y va una parte de los vecinos.
   - Quien desfila va de luto: `AgentFlag.Mourning` (16), que se deriva en el frame.
   - El render lo pinta de morado de Cuaresma y le pone una vela encendida en la mano. El negro no se veía de noche.
3. **Quema:** de 21:30 a 22:30, una hoguera junto a la entrada de la plaza. Esa noche hay baile.
   - Contrato: `Fiesta.bonfire` y, en el frame, `bonfireCount` y `bonfireSites`.
   - El render dibuja una llama que parpadea, con pavesas que suben (usan las chispas de los fuegos).
4. **Varias procesiones por fiesta:** `Fiesta.procession` pasa a ser `processions[]`, con como mucho una por día. El
   carnaval tiene dos: el desfile de disfraces del primer día y el cortejo del cuarto.
5. **Métricas, UI y versiones:**
   - Métricas `festival.mourners` y `festival.bonfires`.
   - HUD: «⚰️ entierro de la sardina». Registro: «⚰️ Entierro de la sardina en …».
   - Protocolo v21 (bandera y hogueras en el frame); motor 0.40.0.

## Consecuencias
- **En el navegador, con dos pueblos:**
  - a las 20:10 del 15 de febrero, las dos sardinas en marcha y 76 vecinos con velas;
  - a las 21:40, la hoguera ardiendo en cada plaza.
- **Mundos de un año:** ahora tienen una noche de baile más.
- **Escenario `carnival`:** comprueba también el cortejo, las dos hogueras y el baile.
- 26/26 en ambos mapas; 190 tests.
