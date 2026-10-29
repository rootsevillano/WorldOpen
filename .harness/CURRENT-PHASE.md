# CURRENT PHASE

**Fase actual:** Fase 5 — Servidor · ✅ **completada** (2026-10-29) · ⏸️ revisión del usuario (O3)
**Siguiente (propuesta):** Fase 2b — mapa real

## Fase 5 — entregado (T6, V2, ADR-0016)
- `apps/server`: mundo vivo que corre sin nadie conectado, guardado en ficheros (snapshot cada 30 s y diario,
  comandos escritos al aplicarse), apagado ordenado con Ctrl+C/SIGTERM, reanudación al arrancar.
- Acceso: usuarios con scrypt, sesión por cookie HttpOnly/SameSite=Strict, bloqueo tras 5 intentos, CLI de usuarios.
- WebSocket con el mismo protocolo: `/ws/live` compartido (observador solo consulta; admin manda; el servidor fija el
  emisor) y `/ws/study` privado por conexión.
- `packages/host`: host del motor compartido por Worker y servidor + códec.
- Web: detección de servidor, pantalla de acceso, UI según el rol, visor de estudio privado; el modo local sigue igual.

## Propuesta de siguientes fases
- **Fase 2b — mapa real** (sigue bloqueada por el acceso a `almensilla-3d`).
- Despliegue: proxy inverso con HTTPS, servicio del sistema, copias de `data/server/`.
- Varios mundos vivos simultáneos por servidor; panel de administración de usuarios en la web.

## Bloqueos / decisiones abiertas
- Acceso a `almensilla-3d` (privado).
- Nombre ficticio del pueblo: provisional "Valdeolivo".
- Exponer el servidor fuera del equipo exige HTTPS (decisión de despliegue del usuario).
