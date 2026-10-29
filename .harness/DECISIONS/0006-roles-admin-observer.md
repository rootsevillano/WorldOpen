# ADR-0006 · Roles: administrador y observador

**Estado:** Aceptada · 2026-10-29 · Fuente: V2

## Contexto
Los invitados acceden con usuario y contraseña y **solo observan**; únicamente el administrador ("Dios") introduce
criterios y comandos. Una autenticación real exige servidor, que llega en la fase de "mundo vivo con la pestaña cerrada".

## Decisión
- Dos roles: `admin` y `observer`. Todo `CommandEnvelope` lleva `issuer: { userId, role }`.
- El **motor** comprueba la autoridad de cada comando (`authority` del registro): un `observer` nunca puede mutar el mundo,
  aunque la UI fallara.
- La **identidad** (quién es `admin`) la resuelve el host:
  - MVP (local, sin servidor): el host local actúa como `admin`. No hay invitados todavía.
  - Fase servidor: login con usuario/contraseña (hash con algoritmo de derivación de claves, nunca en claro),
    sesión, y el servidor asigna el rol. Los observadores reciben frames y eventos, pero sus comandos se descartan.
- La UI oculta los controles de Dios a los observadores (cómodo, no es la barrera de seguridad).

## Consecuencias
- No hay cuentas en el MVP; el modelo de permisos ya existe y está probado en el motor.
- La implementación de auth queda fuera hasta la fase servidor (bloqueo registrado en `CURRENT-PHASE.md`).
