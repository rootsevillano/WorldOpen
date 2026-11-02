# ADR-0044 · Procesión y fuegos artificiales

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0034 y ADR-0035 · Fuente: decisión del usuario

## Decisión
1. **Procesión del día grande** (el festivo de las fiestas), en cada pueblo:
   - **Reunión:** de 11:00 a 12:00, los vecinos que van (acción `Procession`) se acercan a la plaza, que es el local
     de la verbena junto a la parada. Van los de 6 años o más, elegidos por un hash de su id: un 20 % ×
     `society.festivities`, como mucho el 60 %. No se hace ningún sorteo.
   - **Desfile:** a las 12:00, quienes esperan en la plaza salen detrás del paso, de dos en dos, a 30 m/min. Van por
     las calles hasta un punto a unos 250 m y vuelven por el mismo camino.
   - **Vecinos reales:** el sistema `procession` coloca a cada uno en la fila; no tienen trayecto propio ni deciden
     hasta volver. Al llegar a la plaza se quedan en ella. Quien llega tarde a la salida no desfila.
2. **Fuegos artificiales:** la última noche de fiestas, de 00:00 a 00:30, en la plaza de cada pueblo.
3. **Todo se deriva** de la fecha, del mapa (ruta en caché por mundo) y de la acción y ubicación de cada vecino. No
   hay estado nuevo en el snapshot, y restaurar a mitad de la procesión da el mismo mundo.
4. **Frame (protocolo v16):** `pasoCount`, `pasoPositions` y `pasoHeadings` (el paso de cada procesión en curso),
   y `fireworkCount` y `fireworkSites` (plazas con fuegos). El render dibuja el paso (andas doradas con la imagen),
   interpolado entre frames como los vecinos. Anima los cohetes con su propio reloj: ramilletes de chispas de colores
   con gravedad y fundido; no son estado del mundo.
5. **Métricas** `festival.marching`, `festival.pasos` y `festival.fireworks`; el inspector muestra «ir a la
   procesión». Motor 0.32.0.

## Consecuencias
- Comprobado en el navegador (mapa sintético, 600 habitantes): la procesión de dos filas detrás del paso a las
  12:08 del 16 de agosto y los fuegos sobre la plaza a las 00:10 del 19.
- Se probó en ambos mapas: desfilan unos 115 vecinos de 600 (sintético, 2 pueblos) y 274 de 1500 (real). La
  procesión dura una media hora.
- El frame sale después de avanzar el reloj: el paso se calcula a la hora del último tick, para no ir 30 m por
  delante de la fila.
- 21/21 en ambos mapas (nuevo `procession`); 179 tests.
- Pendiente: varias fiestas al año, música y luces de la verbena, y que la procesión pase por la iglesia.
