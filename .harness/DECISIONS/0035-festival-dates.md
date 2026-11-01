# ADR-0035 · Fechas de fiestas en el Modo Dios y fecha de inicio del mundo

**Estado:** Aceptada · 2026-11-01 · Amplía ADR-0034 · Fuente: decisión del usuario

## Decisión
1. **Criterios enteros:** `CriterionDefinition.integer` (opcional): el motor rechaza decimales (`invalid_payload`) y el
   Modo Dios usa pasos de 1. Cambia el catálogo: protocolo v12.
2. **Fechas de las fiestas** (admin, cambian al momento: todo se deriva de la fecha):
   `society.festivalMonth` (1–12, 8), `society.festivalStartDay` (1–30, 15), `society.festivalLength` (1–10, 4) y
   `society.festivalHoliday` (0–10, 2; 0 = ningún festivo; si supera la duración, tampoco hay festivo). Las fiestas
   pueden cruzar fin de mes o de año (meses de 30 días, años de 360).
3. **Fecha de inicio del mundo** al crearlo en la web ("Empieza el … de …"): fija `manifest.time.start` (mes y día; la
   hora sigue siendo las 06:00). Por defecto, el 21 de marzo de siempre. Permite, entre otras cosas, ver las fiestas sin
   simular medio año.
4. Motor 0.23.0.

## Consecuencias
- Comprobado en el navegador: un mundo que empieza el 15 de agosto muestra la verbena y el día grande festivo.
- Los valores por defecto reproducen las fiestas de ADR-0034: los escenarios no cambian (17/17 en ambos mapas).
- Pendiente: varias fiestas al año (romería, Navidad) y elegir la hora de inicio.
