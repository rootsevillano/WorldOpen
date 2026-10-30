# ADR-0018 · Calibración del modelo a escala real

**Estado:** Aceptada · 2026-10-30 · Fuente: D4, S4, S5, E1, ADR-0017

## Contexto
Con 6 000 habitantes sobre el mapa real (escala del municipio) la línea base mostraba: sin niños y un 31 % de 65+
(edad uniforme 18–85), hogares al azar (678 personas solas, casas con 8+), un 25 % durmiendo a las 19:00, cosechas que
aparecían solas en las tiendas y 284 personas haciendo cola de madrugada en tiendas cerradas.

## Decisión
1. **Población por hogares (D4):** cada vivienda catastral recibe un hogar (1–5 miembros: 26/30/21/17/6 %); con 3+,
   normalmente dos adultos e hijos (30 % con un hijo mayor o un abuelo). Edades de adultos con pirámide aproximada; en
   hogares de 1–2 personas, más peso de 65+. Resultado: 24 % menores, 25 % 18–39, 31 % 40–64, 20 % 65+.
2. **Ocupaciones por edad:** 0–5 en casa (`child`); 6–17 a la escuela más cercana, un servicio público, de 09:00 a
   14:00 (`student`); 67+ jubilados. Los menores de 14 no salen solos ni hacen recados.
3. **Sueño por cronotipo:** columna `bedtime` (niños 21:00–22:00; mayores de 12, 22:30–00:30) y duración por edad
   (10 / 9 / 7.5 h). Se duerme en esa ventana (fuera de ella, solo con agotamiento) y se vuelve a casa en la última
   hora. La noche del entorno empieza a las 21:30 y es plena a las 23:00 (horario español).
4. **Logística con agentes:** la cosecha se acumula en la huerta; un agricultor en su huerta, con ≥ 20 unidades y
   comercios abiertos, lleva hasta 40 a la tienda más cercana (acción `deliver`, evento `harvest.delivered`). Las
   importaciones del Exterior siguen abstractas (E5).
5. **Atención:** mostradores según el tamaño del local (1 por cada 50 m², mínimo 2) más los trabajadores; al cerrar,
   la cola se disuelve sin recordar la tienda como vacía.
6. Motor 0.6.0 (cambia la evolución y el snapshot).

## Consecuencias
- Rendimiento con 6 000 habitantes en el mapa real: ≈ 185 ticks/s (objetivo ≥ 20); 2 000: ≈ 590 ticks/s.
- Los hogares grandes con niños sufren más un corte de agua (los menores no hacen recados): el escenario `water-cut`
  afirma ahora "sed sostenida y daño limitado" con umbrales 0.3 / 0.6.
- Pendiente (fuera de esta decisión): nacimientos y muertes (S5), dinero y empleo (E1-C), vehículos.
