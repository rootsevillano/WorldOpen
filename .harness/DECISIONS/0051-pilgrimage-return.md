# ADR-0051 · Vuelta de la romería en procesión

**Estado:** Aceptada · 2026-11-07 · Amplía ADR-0050 · Fuente: decisión del usuario

## Decisión
1. **Tramos:** la procesión de un día se describe como una lista de tramos (`legsToday`).
   - Cada tramo tiene salida, ruta, duración, si hay reunión antes y si al llegar se sigue en la procesión.
   - Las fiestas y la cabalgata tienen un tramo, de la plaza al punto de giro y vuelta.
   - La romería tiene dos:
     - **ida** a las 9:00, de la plaza a la ermita, con reunión, y al llegar se sigue en la procesión (ADR-0050);
     - **vuelta** a las 17:30 (`procession.back`), de la ermita a la plaza por el mismo camino al revés, sin reunión.
       Al llegar cada uno queda libre.
2. **La vuelta:** a las 17:30 sale todo vecino del pueblo que esté en la ermita, sin contar a los visitantes ni a
   quien esté ocupado.
   - **Hora:** 17:30 cae en tick con ticks de 5, 10, 15 y 30 minutos. 17:45 no caía con ticks de 10, y el paso no se
     veía hasta las 18:00.
3. **Día de campo:** con vuelta en procesión, el día de campo dura hasta la salida de la vuelta, incluido su tick.
   - Se decide antes de que la procesión recoja a la gente: si terminara en ese tick, un tercio se iba a casa por su
     cuenta.
   - Después nadie va ya a la ermita: antes llegaban rezagados tras la salida de la vuelta.
4. **Motor:** 0.39.0. El protocolo sigue en v20.

## Consecuencias
- **En el navegador:** a las 17:40 la procesión sube por el camino hacia el pueblo con el paso delante; a las 18:40 ya
  no queda nadie en la ermita.
- **Escenario `romeria`:** comprueba el paso de la vuelta a las 17:50.
- 26/26 en ambos mapas; 189 tests.
- **Pendiente:** el entierro de la sardina.
