# Simulation API (UI host ⇄ Engine host)

Código: `packages/contracts/src/protocol.ts`. Implementación de referencia: `apps/web/src/engine-host/hostCore.ts`.

## Secuencia

```text
UI                                   Engine host (Worker)
 │ init {protocol, manifest, snapshot?, log?} ─▶│ crea Simulation (o restaura snapshot + log)
 │◀──────────────── ready {worldId, tick} ───────│
 │ query {catalog} ─────────────────────────────▶│
 │◀──────────── queryResult {commands, criteria} │
 │ control {play} / {setSpeed: 5|'max'} ────────▶│ el host avanza ticks a su ritmo
 │◀──── frame (≤ 30/s, buffers transferidos) ────│
 │◀──── status (≈ 4/s) · events (por lotes) ─────│
 │ command {envelope} ──────────────────────────▶│ se encola; se aplica al inicio del siguiente tick
 │◀── commandAccepted {appliedAtTick} | commandRejected {reason}
```

## Reglas
- `init` con `protocol` distinto de `PROTOCOL_VERSION` ⇒ `error` y el host no arranca.
- Tras `init` el mundo está **en pausa**. `step {ticks}` avanza N ticks estando en pausa (depuración, gates).
- `setSpeed` y `play/pause` **no** se registran en el log: no alteran el estado (ADR-0002).
- Un `command` se valida al recibirlo (tipo, estado, autoridad, payload). Si es válido se aplica al inicio del tick
  `max(atTick, tick)` — donde `tick` es el número de ticks ya completados, es decir, el próximo que se ejecutará — y responde `commandAccepted`; si no, `commandRejected`. Nunca se aplica a medio tick.
- Tras cada lote de ticks el host publica un `frame` (como mucho 30 por segundo) y los `events` acumulados.
- `query {snapshot}` devuelve el estado completo; `query {log}` el log de comandos aceptados; `query {map}` los mapas
  lógicos de las regiones (estáticos: el render los pide una vez).
- Protocolo v2 (Fase 2): `RenderFrame.agentFlags` y `query {map}`.
- Errores dentro del motor ⇒ `error` y el host se pausa (el mundo no avanza en estado inconsistente).
