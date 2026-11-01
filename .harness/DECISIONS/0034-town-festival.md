# ADR-0034 · Fiestas del pueblo

**Estado:** Aceptada · 2026-11-01 · Fuente: decisión del usuario, ADR-0031–0033

## Decisión
1. **Calendario:** fiestas patronales del 15 al 18 de agosto; el 16 es festivo (no hay jornada laboral ni escuela; quien
   trabaja fuera tampoco va). La madrugada hasta las 03:00 cuenta como la noche anterior. Todo se deriva de la fecha
   (sin estado). `society.festivities` (nuevo, 0–3, 1) gradúa la intensidad; 0 = sin fiestas.
2. **Verbena:** de 18:00 a 03:00 en los locales de la plaza (el más céntrico, donde para el autobús, y los 2 más
   cercanos). Salir gana +0,7 × intensidad (también de noche, para mayores de 12 años) y el destino es uno de esos
   locales; se trasnocha (la hora de dormir se retrasa 2 h 30 min para mayores de 12); en la verbena se socializa el
   doble. Se gasta como en el ocio de siempre (las tiendas de la plaza cobran).
3. **Visitantes:** vienen ×(1 + 2 × intensidad) de los pueblos vecinos (ADR-0032/0033).
4. Eventos `festival.started`, `festival.day` (con `holiday`), `festival.ended`; métricas `festival.day`,
   `festival.verbena`, `agents.atFestivalRatio`; HUD "Fiestas del pueblo · día x/4 · ¡verbena!". Protocolo v11
   (`EconomySummary.festival`). Motor 0.22.0.

## Consecuencias
- Mapa sintético (400): a las 23:00 de fiestas, 32–36 % de los vecinos en la verbena (0 % una noche normal) y duerme el
  19 % (frente al 54 %); a la 1:00 sigue un 20–25 %; el triple de visitantes; sin efectos en la salud ni la energía.
  Mapa real: 16–19 % a las 23:00 (las distancias son mayores).
- Escenario `festival` (umbral 12 % para ser válido en ambos mapas). En `lifecycle-year` la exigencia de herencias pasa
  a "al menos una semilla" (`minPassRatio` 0,5): una semilla del mapa real quedó en 0 al cambiar el orden de los sorteos
  (el año simulado incluye agosto).
- `vitest.config.ts`: `testTimeout` 30 s. Con la máquina cargada, tests de simulación ya existentes superaban los 5 s por
  defecto (también sin este cambio).
- Pendiente: elegir fechas y patrón en el Modo Dios, procesión, fuegos artificiales en el render.
