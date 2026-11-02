# ADR-0045 · Paradas, horarios según la demanda y atascos

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0025, ADR-0030, ADR-0031 y ADR-0036 · Fuente: decisión del usuario

## Decisión
1. **Horarios según la demanda**, por pueblo (`arrivals(world, town)`). Parten del horario base (cada hora de 07:00 a
   21:00 × `society.transit`):
   - **Hora punta** (07:00–09:00 y 15:00–17:00): un autobús más por cada 15 viajeros, hasta 4 por hora y como mucho
     uno cada 15 min. Son viajeros quienes trabajan fuera del mundo y no tienen coche en casa.
   - **Pueblo pequeño:** con menos de 150 vecinos, fuera de las horas punta pasa la mitad.
   - La demanda (`busDemand`) se calcula del estado en cada tick; es determinista y no se guarda.
2. **Capacidad:** cada autobús lleva 50 viajeros. Quien no cabe espera al siguiente, y se emite `bus.full` con
   `leftBehind`. Los visitantes que se van ocupan plaza, pero siempre se van.
3. **Atascos en la carretera comarcal:**
   - **Velocidad:** en cada tramo baja con la densidad de coches según una curva BPR: 1 / (1 + 0,15·r⁴), con r =
     coches / capacidad. La capacidad es de 6 coches por km, una carretera estrecha de un carril por sentido. La
     velocidad no baja del 15 %.
   - **Coches atascados:** por debajo del 60 % llevan la bandera `AgentFlag.Jammed` (4) y el render les enciende
     las luces de freno.
   - **Aviso:** cuando un tramo se atasca, es decir, cuando ninguno de sus coches estaba marcado, se emite
     `traffic.jam` con `from`, `to` y `cars`.
   - Dentro de los pueblos no hay atascos.
4. **Paradas visibles:** el frame lleva `busStopCount`, `busStopPositions` y `busStopHeadings` (protocolo v17). El
   render dibuja una marquesina azul, con tejadillo, panel y poste con cartel, en la acera junto al final de la
   carretera de cada pueblo.
5. **Métricas** `roads.carsOnLinks`, `roads.slowestLink` y `agents.jammed`. El registro web muestra los atascos y
   los autobuses llenos. Motor 0.33.0.

## Consecuencias
- **Atascos con 3 pueblos y 3000 vecinos:** la carretera comarcal se atasca de 08:10 a 08:40 y de 15:05 a 15:40 en
  el mapa sintético (hasta 90 coches parados). En el real es raro (en una de dos semillas).
- **Con 800 vecinos** no hay atascos.
- **La capacidad es estilizada:** 6 coches por km es mucho menos que una carretera real. Está calibrada para que
  el tráfico se note con poblaciones de miles.
- **Horarios:** refuerzos solo donde muchos trabajan fuera sin coche. Los pueblos pequeños pierden autobuses en
  horas valle; el escenario `towns` baja su umbral de 45 a 30 llegadas.
- 22/22 en ambos mapas (nuevo `traffic`); 182 tests.
- **Pendiente:** atascos dentro de los pueblos, semáforos, que la gente salga antes si sabe que hay atasco y
  líneas de autobús entre pueblos del mundo.
