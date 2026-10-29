# CURRENT PHASE

**Fase actual:** Fase 4 — Visor de estudio · ✅ **completada** (2026-10-29) · ⏸️ revisión del usuario (O3)
**Siguiente (propuesta):** Fase 2b — mapa real · Fase 5 — servidor

## Fase 4 — entregado (T5, ADR-0015)
- Modo `replay` en el host del motor: abrir cualquier mundo guardado, saltar a cualquier tick, reproducir a 1×–máx
  hasta el final de la grabación, solo lectura; inspector y "seguir" disponibles.
- Análisis en segundo plano: series por hora de 14 métricas + verificación del replay contra cada snapshot.
- UI: línea de tiempo con marcadores de las intervenciones de Dios, gráficas con cursor/tooltip/clic para saltar,
  descarga CSV. CLI: `worldopen study`.
- Corrección de fondo: el hash de estado ya no incluye la cola de comandos pendientes (motor 0.4.0).

## Propuesta de siguientes fases
- **Fase 2b — mapa real:** bloqueada por el acceso a `almensilla-3d` (plan sin cambios).
- **Fase 5 — servidor (T6, V2):** host del motor en Node con almacén persistente, WebSocket con el mismo protocolo,
  mundo vivo con la pestaña cerrada y login de invitados observadores (que también podrán usar el visor).
- Mejoras del visor: comparar dos mundos (p. ej. con y sin ola de calor) en las mismas gráficas; migración de
  snapshots entre versiones del motor.

## Bloqueos / decisiones abiertas
- Acceso a `almensilla-3d` (privado).
- Nombre ficticio del pueblo: provisional "Valdeolivo".
- Los mundos guardados con el motor 0.3.0 ya no se pueden reproducir (ADR-0015). Si llega a importar, haría falta
  migración de snapshots.
