# ADR-0009 · Modelo de tiempo parametrizable

**Estado:** Aceptada · 2026-10-29 · Fuente: T1, T2, T3

## Decisión
- El tick es la unidad atómica. Su duración la fija el manifiesto: `time.minutesPerTick` (por defecto **1**).
  Ningún sistema asume 1 minuto: todo cálculo usa `minutesPerTick` (o tasas "por minuto de juego").
- El calendario (`GameClock`) convierte tick → fecha de juego (`time.start`, año de 360 días = 12 meses de 30 días,
  estaciones del hemisferio norte). Calendario simplificado y determinista; la luz solar en el render usa la latitud real
  para que la sombra sea creíble.
- La **velocidad** es del host: `ticksPerSecond` (1× = 1 tick/s; presets 0, 1, 5, 20, máximo) y es libre.
- Cambiar `minutesPerTick` en un mundo ya creado no está permitido en el MVP (cambiaría el significado del log).

## Consecuencias
- 1 día = `1440 / minutesPerTick` ticks. Los escenarios de gates se expresan en horas/días de juego, no en ticks.
