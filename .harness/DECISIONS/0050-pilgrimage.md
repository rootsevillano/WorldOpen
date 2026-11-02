# ADR-0050 · Procesión de la romería a la ermita

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0044, ADR-0046 y ADR-0049 · Fuente: decisión del usuario

## Decisión
1. **Salida:** el día de la romería, si el pueblo tiene ermita, sale una procesión a las 9:00 desde la plaza.
   - Desde las 8:00 se reúnen en la plaza quienes van a la romería (`romeriaParticipant`).
   - Sale detrás del paso, de dos en dos, como la procesión de las fiestas (ADR-0044).
   - Va por las calles y el camino de tierra hasta la ermita (`pilgrimageRoute`, cacheada por mundo), sin vuelta.
2. **Duración:** lo que tarde la última pareja en llegar más media hora, con un mínimo de 90 minutos.
   - Al llegar, cada romero se queda en la ermita, en la pradera (ADR-0049).
   - No decide nada hasta que acaba la procesión, así no se vuelve antes de que empiece el día de campo
     (10:00–18:00).
3. **Merienda:** en la ermita, el día de la romería, se come y se bebe lo que se ha traído de casa: sale de la
   despensa del hogar.
   - Sin la merienda, al acabar la procesión la mitad volvía a casa a comer y regresaba al cabo de una hora.
   - La pradera se ve todo el día de la romería, no solo de 10:00 a 18:00.
4. **Motor:** 0.38.0. El protocolo sigue en v20.

## Consecuencias
- **En el navegador:**
  - a las 9:20 la procesión sale del pueblo por el camino, con el paso delante;
  - a las 10:00 están todos en la pradera de la ermita, unas 150 personas.
- **Mapa real:** el camino es más largo y la procesión llega hacia las 11:00. El escenario `romeria` comprueba el paso
  a las 9:10 y la gente en la ermita a las 11:30.
- 26/26 en ambos mapas; 188 tests.
- **Pendiente:** el entierro de la sardina; la vuelta de la romería al atardecer, también en procesión.
