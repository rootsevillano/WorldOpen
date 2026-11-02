# ADR-0049 · Ermita en el campo para la romería

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0036 y ADR-0046 · Fuente: decisión del usuario

## Decisión
1. **Una ermita por pueblo:** el motor añade a cada mapa al cargarlo (`withHermitages`) un edificio con
   `role: 'hermitage'` (uso `unknown`, sin viviendas ni puestos de trabajo, no es un local).
   - **Dónde:** a 400 m más allá del casco del pueblo. El centro del casco es la mediana de las viviendas y su borde,
     el 90 % de ellas.
   - **Dirección:** de las 8 de la rosa, la más alejada de los demás pueblos. Con un solo pueblo, la elige un hash de
     la región.
   - **Camino:** un camino de tierra (`track`, «Camino de la ermita») la une al nodo de calle más cercano del pueblo.
   - Un map-pack que ya traiga su ermita la conserva. `NavMap.towns[].hermitage` da su índice (−1 si no hay).
2. **Carretera comarcal:** no sale de los nodos de las ermitas.
3. **Romería:** pasa de hacerse en el merendero a la ermita, que también cuenta como sitio de fiesta para socializar.
   Sin ermita, se sigue usando el merendero.
4. **Pradera (solo en el frame):** durante la romería, quien está en la ermita se ve fuera, en la pradera de
   alrededor, de 12 a 40 m del centro. Cada persona tiene un punto fijo, por hash del id (`meadowFrame`). Se deriva,
   así que no cambia el estado.
5. **Render:**
   - La ermita se dibuja como volumen encalado, también junto a un map-pack.
   - `Simulation.mapLogic()` añade el mapa `ermitas` con los caminos de los map-packs, cuyas calles no se dibujan del
     mapa lógico.
6. **Motor:** 0.37.0, porque cambian los mapas y el hash. El protocolo sigue en v20.

## Consecuencias
- **En el navegador:**
  - mapa sintético: a las 13:00 del 27 de mayo, la ermita blanca al oeste del pueblo, con su camino y los vecinos
    en la pradera;
  - mapa real: la ermita en el campo, al sureste del casco, con unas 90 personas.
- **Índices de los edificios:** cambian, porque cada pueblo tiene un edificio más. Los mundos guardados con el motor
  anterior no se reabren, como en cada cambio de versión.
- **Escenario `traffic` (mapa real):** antes pasaba por suerte (atasco en 1 de 2 semillas; con 6 semillas, en 1). Sube
  de 3000 a 4000 vecinos: con ellos hay atasco en 4 de 6 semillas en el mapa real y en 6 de 6 en el sintético.
- 26/26 en ambos mapas; 187 tests.
- **Pendiente:** la procesión de la romería desde la plaza hasta la ermita, y el entierro de la sardina.
