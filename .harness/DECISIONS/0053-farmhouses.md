# ADR-0053 · Casas de campo

**Estado:** Aceptada · 2026-11-08 · Amplía ADR-0036 y ADR-0049 · Fuente: decisión del usuario

## Decisión
1. **Cuántas:** al cargar los mapas, el motor añade a cada pueblo casas sueltas en el campo (`withFarmhouses`).
   - Son un edificio de viviendas con una vivienda y `role: 'farmhouse'`.
   - Su número es una parte de los edificios de viviendas del casco: `society.ruralHomes`, de 0 a 0,3, por defecto
     0,05, con un máximo de 40 por pueblo.
   - El criterio se fija al crear el mundo (`mutableBy: 'system'`), porque cambia el mapa.
2. **Dónde:**
   - Entre 150 y 800 m más allá del casco, en direcciones que salen de un hash de la región, sin sorteo.
   - Lejos del casco de los demás pueblos (más de 300 m) y de cualquier otro edificio (40 m o más).
   - En un map-pack, además, a menos de 250 m de un camino del mapa. El terreno no cubre todo el rectángulo de sus
     límites y había casas en el vacío.
   - Un camino de tierra («Camino del cortijo») une cada casa al nodo más cercano: una calle, la ermita u otra casa.
   - En un map-pack, la casa y su nodo toman la cota de ese nodo (`baseY`), igual que la ermita.
3. **Vida en el campo:** la población se reparte por viviendas, así que viven hogares en ellas sin más.
   - Tienen más coche: `1 − (1 − p)²`, con p = `society.carOwnership`. Con 0,75 da 0,94, y sin coches en el pueblo
     tampoco hay aquí.
   - Sus trayectos son más largos, así que se coge más el coche.
4. **Mapa:**
   - La carretera comarcal no sale de los caminos del campo; `NavMap.outskirts` son sus nodos.
   - La procesión de las fiestas no gira en ellos.
   - `NavMap.towns[].farmhouses` lista las casas de cada pueblo.
5. **Render:**
   - Las casas se dibujan como volúmenes de cal con ocre, apoyados en su cota.
   - Los caminos del campo siguen la pendiente entre sus extremos.
   - El mapa de caminos del campo pasa a llamarse `campo` e incluye los de las ermitas.
6. **Métricas y versiones:** métricas `households.rural` y `households.ruralCarRatio`. Motor 0.41.0. El protocolo
   sigue en v21.

## Consecuencias
- **En el navegador:**
  - mapa sintético: con dos pueblos, 4 casas por pueblo al final de sus caminos;
  - mapa real: 40 casas junto a caminos del término, sobre el terreno.
- **Tests unitarios:** el manifiesto de pruebas deja `society.ruralHomes` a 0, porque las mecánicas se prueban sobre
  el casco tal cual; las casas de campo tienen su propio test.
- **Tres escenarios calibrados con pocas viviendas** (`households`, `households-year` y `housing-crisis`) también lo
  dejan a 0. En `housing-crisis` las casas de campo aliviaban la escasez que el escenario necesita; los otros dos iban
  muy justos.
- Escenario nuevo `rural`; 27/27 en ambos mapas; 191 tests.
- **Pendiente:** huertas y animales propios en las casas de campo.
