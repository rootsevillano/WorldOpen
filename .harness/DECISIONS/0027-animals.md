# ADR-0027 · Animales: perros y ganado

**Estado:** Aceptada · 2026-10-31 · Fuente: S1 (animales en fases posteriores), E2, ADR-0018

## Decisión
1. **Almacén propio** (`AnimalStore`, ECS sobre TypedArrays): id, tipo (perro, oveja, gallina), posición, rumbo,
   banderas, hogar (perros) o huerta (ganado), nacimiento, paseo. Va en el snapshot (`animals`) y en el hash.
2. **Perros:** un hogar tiene perro si un hash de su id es menor que `society.petOwnership` (nuevo, 0–1, 0,3). Lo
   saca un miembro de 10+ que sale a pie por ocio (de camino o en el local); le sigue un paso por detrás (ocupa la
   posición previa del paseante) y vuelve a casa con él. Un perro sin pasear anima a salir (+0,35 a "salir") y, si a
   medianoche no ha salido 20 min, baja la necesidad social del hogar (−0,05); pasearlo la sube. Comida: 2 al día ×
   `economy.priceLevel`. Mueren de viejos (desde los 10 años) y los hogares que suelen tener perro adoptan otro
   (1/60 al día). Si el hogar deja el pueblo, el perro se va con él.
3. **Ganado:** cada huerta tiene una gallina por cada 20 m² y una oveja por cada 100 m² de nave × `economy.livestock`
   (nuevo, 0–3, 1), ajustado cada medianoche. De día deambulan cerca de la nave (a 4 y 6 m/min); de noche (o con la nave
   ardiendo o dañada) están recogidos. Los días en que alguien trabaja la huerta dan 0,5 (gallina) y 1 (oveja)
   raciones, hasta la capacidad del almacén.
4. **Sin PRNG:** sorteos y puntos de paseo salen de hashes (id, día o tick): no desplazan la evolución del resto.
5. **Render (protocolo v5):** `RenderFrame` añade `animalCount`, `animalIds`, `animalPositions`, `animalHeadings`,
   `animalKinds` (`AnimalKind`) y `animalFlags`; el render dibuja perros, ovejas y gallinas (cuerpo y cabeza)
   interpolados y no dibuja los recogidos. HUD: perros, ovejas y gallinas. Motor 0.15.0.

## Consecuencias
- Mapa sintético (400): 46 perros, 40 ovejas, 200 gallinas; todos los perros salen a diario. Mapa real (2 000): 218
  perros (≈ 70 % paseados cada día), 93 ovejas y 537 gallinas. Ganado fuera de día (≈ 85 %), dentro de noche.
- `daily-cycle` comprueba animales fuera a mediodía, recogidos a medianoche y perros paseados.
- Rendimiento: `gate:perf` (2 000 habitantes, mapa sintético) 3,0 → 3,7 s; mapa real 7,8 → 9,0 s.
- Pendiente: seleccionar animales en el inspector, fauna salvaje, animales de tiro en la época histórica.
