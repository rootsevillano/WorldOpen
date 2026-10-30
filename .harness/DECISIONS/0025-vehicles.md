# ADR-0025 · Vehículos (coche por hogar)

**Estado:** Aceptada · 2026-10-30 · Fuente: S1 (vehículos en fases posteriores), E1-C, ADR-0024

## Decisión
1. **Propiedad:** un coche por hogar con probabilidad `society.carOwnership` (nuevo, 0–1, 0,75 ≈ España), decidida
   por un hash del id del hogar (sin consumir el PRNG; cambiar el criterio se aplica al momento). En la época histórica
   (`world.era`) no hay coches.
2. **Uso:** un adulto que sale de casa coge el coche si la ruta mide ≥ 800 m, el coche del hogar está libre y tiene
   dinero para la gasolina de ida y vuelta. Columna `driving`: el coche va con él (todos sus trayectos) hasta que vuelve
   a casa, donde queda aparcado. Los hogares con el coche fuera se recalculan al empezar cada decisión (transitorio).
3. **Movimiento:** por las mismas calles, a 400 m por minuto (≈ 24 km/h) frente a 75 a pie; gasolina 0,15 por km ×
   `economy.priceLevel`, pagada al Exterior.
4. **Render:** `AgentFlag.Driving` (bit 2, compatible: protocolo v4 sin cambios); el render dibuja una caja de coche
   (color estable por conductor) en lugar del monigote; seleccionar el coche selecciona al conductor. Inspector:
   "hay coche en casa" / "lleva el coche". Métricas `agents.drivingRatio`, `households.carRatio`. Motor 0.13.0.

## Consecuencias
- Mapa real (2 000 habitantes): hasta un 6 % de la población conduce a la vez a primera hora; con coche se trabajan
  ≈ 359 min por jornada frente a 297 sin coches (menos tiempo en trayectos). Mapa sintético: el trayecto más largo mide
  815 m y casi nadie conduce (realista en un pueblo pequeño).
- Con ticks de 10 min un trayecto en coche dura un tick: los coches casi no se ven en las métricas de los escenarios,
  pero sí en el navegador (ticks de 1 min).
- Rendimiento con 2 000 habitantes en el mapa real: 10 000 ticks en ≈ 7,9 s (antes 6,6).
- **`housing-crisis` revisado:** con coches, en el mapa real los inquilinos más pobres morían de hambre antes del mes
  de impagos y una semilla no tenía desahucios. El escenario pasa a alquileres ×10 con el bienestar normal (la ayuda
  de emergencia cubre la comida, no el alquiler): hay desahucios y nadie muere de hambre. Para ello
  `economy.rentLevel` admite 0–10 (antes 0–4) y el atractivo para inmigrar usa el alquiler efectivo
  (índice × nivel), no solo la ocupación.
- Pendiente: atascos y aparcamiento, transporte público, animales.
