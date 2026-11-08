# ADR-0055 · Animales del cortijo

**Estado:** Aceptada · 2026-11-08 · Amplía ADR-0027, ADR-0053 y ADR-0054 · Fuente: decisión del usuario

## Decisión
1. **Cada casa de campo tiene su corral.**
   - Es un rectángulo de 14 × 10 m al otro lado de la casa que el huerto, alineado con la dirección del pueblo, a 3 m
     de la casa.
   - Se aparta de los demás edificios como la casa y el huerto. Si no cabe, se prueba otro sitio para la casa.
   - Contrato: `BuildingRecord.pen`, opcional. Tiene la misma forma que el huerto (`GroundPlot`: `x`, `z`, `length`,
     `width`, `dirX`, `dirZ`); su cota es la de la casa.
   - El protocolo sigue en v21: el campo es opcional y no rompe a nadie.
2. **Animales del corral (reutiliza el ganado de ADR-0027):**
   - Cada corral tiene de 4 a 8 gallinas y de 1 a 3 ovejas, según un hash de la casa, multiplicado por
     `economy.livestock`. Con 0 no hay ninguno.
   - Se reponen o retiran a medianoche, como el ganado de las huertas (`AnimalStore.farm` = la casa).
   - De día andan por el corral, hasta un metro de la cerca. De noche (o si la casa arde) se recogen y no se dibujan.
3. **Huevos y leche:**
   - Cada noche, si vive alguien en la casa, cada gallina da 0,5 raciones y cada oveja 1, multiplicadas por la
     abundancia de comida (como el ganado de las huertas).
   - Van a la despensa de la casa, con el mismo tope que el huerto: 12 raciones por residente.
   - No se venden: esos hogares compran todavía menos.
   - No hace falta una acción nueva para cuidarlos: no gastan números del PRNG ni cambian las decisiones.
4. **Render:**
   - El corral es una cerca baja de madera, con un cobertizo pegado por fuera al extremo más lejano del pueblo. Así,
     dentro, los animales andan libres.
   - La cerca y el cobertizo bajan 3 m por debajo del punto más alto del terreno bajo el corral, como el huerto: no
     quedan huecos en la pendiente.
   - Los animales se dibujan con las mallas de siempre (oveja, gallina).
5. **Inspector:** el ganado de un corral dice «por el corral» o «recogido en el corral» y «del corral de la casa de
   campo …, da N ración(es) al día a la despensa de casa». `AnimalDetail.farmhouse` (opcional) lo distingue.
6. **Métricas y versiones:** `animals.farmhouse` (animales en los corrales) y `animals.farmhouseOutdoorsRatio` (qué
   parte anda fuera). Motor 0.43.0.

## Consecuencias
- Las cifras globales de `animals.hens` y `animals.sheep` incluyen ya los corrales.
- Unos 8 animales por casa de campo: 37 en el escenario `rural` (mapa sintético) y 321 en el mapa real.
- Mapa real: los 40 corrales caen sobre el terreno (raycast contra `TERRAIN`).
- Exigir sitio libre también para el corral cambia dónde caen algunas casas de campo, así que los mundos guardados con
  0.42 no se reabren igual.
- Escenario `rural`: animales en los corrales, todos fuera a mediodía y todos recogidos de madrugada.
- Los árboles del map-pack pueden caer dentro del huerto o del corral: no se quitan, igual que en ADR-0054.
- 27/27 en ambos mapas; 193 tests.
