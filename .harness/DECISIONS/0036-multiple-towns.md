# ADR-0036 · Varios pueblos en un mundo

**Estado:** Aceptada · 2026-11-01 · Amplía ADR-0031 y ADR-0032 · Fuente: decisión del usuario

## Decisión
1. **Un pueblo por región.** Un mundo tiene de 1 a 3 pueblos (`manifest.regions`). El primero es el mapa elegido (real
   o sintético); los demás son pueblos sintéticos con nombre inventado (`townName`), 1,5 km al este uno de otro
   (`neighbourTowns`). Los ids de nodo sintéticos usan el espacio de su región (`regionNodeBase`) para no chocar.
2. **Carretera comarcal:** `NavMap` une cada pueblo con el siguiente por su par de nodos más cercano (tramo recto,
   coste = distancia). Se puede ir andando o en coche a otro pueblo. `linkLogic()` la expone como un `MapLogic`
   `comarcal` para dibujarla.
3. **Lo local, por pueblo:** cada pueblo tiene su carretera de autobús, parada, hostal, plaza y verbena. El ocio
   (`GoOut`) y el colegio se buscan en el pueblo propio. El trabajo puede estar en otro pueblo (desplazamiento diario).
   Los visitantes y huéspedes se asignan al pueblo de su parada.
4. **Métricas e inspector:** `town.<región>.population`, `towns.count`, `agents.workInOtherTownRatio`;
   `EconomySummary.towns` (protocolo v13) y una línea por pueblo en el HUD. La web pide el número de pueblos al crear
   el mundo. Motor 0.24.0.
5. **Render mixto:** con un mapa real, los pueblos sintéticos y la carretera se dibujan como volúmenes y franjas.

## Consecuencias
- Un mundo de un solo pueblo no cambia: 18/18 escenarios en ambos mapas (nuevo `towns`), 169 tests.
- En el navegador, Valdeolivo con 2 vecinos sintéticos: 1275 · 103 · 122 habitantes, sin errores.
- Pendiente: pueblos vecinos a partir de otros map-packs reales, migración entre pueblos y elegir dónde ponerlos.
