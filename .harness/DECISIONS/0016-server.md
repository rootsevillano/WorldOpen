# ADR-0016 · Servidor: mundo vivo compartido, acceso y visores privados

**Estado:** Aceptada · 2026-10-29 · Fuente: T6, V2, ADR-0002, ADR-0006

## Decisión
- **`apps/server`** (Node 24, `ws` 8.22.0): aloja el mismo `EngineHostCore` que el Worker (extraído a
  `packages/host`) con `FileWorldStore`. Al arrancar reanuda el último mundo sin terminar (o crea uno) y lo pone en
  marcha: **el mundo vive aunque no haya nadie conectado** (T6). Sirve la web compilada.
- **Durabilidad:** los comandos aplicados se escriben en el log **en el acto** (también en el Worker), y el servidor
  guarda un snapshot cada 30 s de tiempo real además del diario. Al parar con señal (Ctrl+C/SIGTERM) guarda y cierra;
  ante una caída se pierden como mucho ~30 s de evolución, nunca una intervención de Dios.
- **Acceso (V2):** usuarios en `data/server/users.json` con **scrypt** (sal por usuario, comparación en tiempo
  constante, hash ficticio para usuarios inexistentes); alta por CLI (`npm run server -- user add`). Sesión con token
  aleatorio de 256 bits en cookie `HttpOnly; SameSite=Strict` (`Secure` con `--secure`), caduca a las 12 h y se pierde
  al reiniciar. Bloqueo por IP tras 5 intentos fallidos en 15 min.
- **WebSocket** con el mismo Simulation Protocol y un códec JSON con arrays tipados en base64 (`packages/host/codec`).
  Exige sesión y mismo origen (contra CSWSH). `/ws/live`: mundo compartido; el observador solo puede consultar
  (`query`); el administrador además controla el tiempo, manda comandos y crea/abre/termina mundos. **El servidor
  fija el emisor** de cada comando a partir de la sesión: no se puede suplantar el rol. Respuestas a consultas y
  confirmaciones de comandos van solo a quien las pidió.
- **`/ws/study`:** cada conexión tiene su **propio visor de estudio** (otro `EngineHostCore`, almacén de solo
  lectura): estudiar no cambia el mundo de los demás. Estudiar el mundo vivo lo guarda antes para llegar al presente.
- **Web:** detecta el servidor (`/api/session` con JSON); con servidor pide acceso y adapta la UI al rol; sin él,
  modo local con Worker e IndexedDB como hasta ahora. En desarrollo, `WORLDOPEN_SERVER=http://127.0.0.1:8787`
  activa el proxy de Vite.

## Consecuencias
- Un solo mundo vivo por servidor. Frames a 10/s por cliente (la red pesa más que en el Worker).
- Escucha en `127.0.0.1` por defecto: exponerlo a otros equipos requiere un proxy inverso con HTTPS (y `--secure`).
