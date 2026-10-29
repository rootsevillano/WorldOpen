# CURRENT PHASE

**Fase actual:** Fase 3 — MVP completo · ✅ **completada sobre mapa sintético** (2026-10-29) · ⏸️ revisión del usuario (O3)
**Siguiente (propuesta):** Fase 2b — mapa real · Fase 4 — visor de estudio y fase servidor

## Fase 3 — entregado (decisión del usuario: continuar sobre el mapa sintético)
1. Histórico de mundos (T5): IndexedDB en el Worker, ficheros en el CLI, verificación por replay.
2. Inspector de agente/edificio y seguir con la cámara (G1).
3. Economía de recursos (E1–E5) → V4 (3) escasez con colas y desplazamientos.
4. Memoria acotada y relaciones (S6); `disaster.fire` (G1).
5. Escala: 2 000 agentes muy por encima del objetivo; LOD aplazado (ADR-0014).

Con esto se cumplen los tres comportamientos de V4 y todos los poderes de G1 del MVP.

## Pendiente del MVP original
- **Mapa real** (D1–D3): sigue bloqueado por el acceso a `almensilla-3d` (Fase 2b, plan sin cambios).

## Propuesta de siguientes fases
- **Fase 2b — mapa real:** pipeline en `almensilla-3d` (edificios lógicos, grafo de calles, map-pack anonimizado) y
  cargador en WorldOpen; recalibrar gates con distancias reales.
- **Fase 4 — visor de estudio (T5):** reproducir en la web un mundo terminado con línea de tiempo, saltos por snapshot
  y los cambios de criterios superpuestos.
- **Fase 5 — servidor (T6, V2):** host del motor en Node con `FileWorldStore`/BD, WebSocket con el mismo protocolo,
  login de invitados observadores.

## Bloqueos / decisiones abiertas
- Acceso a `almensilla-3d` (privado).
- Nombre ficticio del pueblo: provisional "Valdeolivo".
- Calibración: la gente se acuesta pronto (19–21 h); con 2 000 habitantes el mapa sintético (100 edificios) queda
  muy denso (20 por edificio) y las fuentes se agotan de noche.
