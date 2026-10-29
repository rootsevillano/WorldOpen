# Contratos

**Fuente de verdad:** `packages/contracts/src/*.ts`. Estos documentos explican el porqué y las reglas que los tipos no
pueden expresar. Si un documento y el código discrepan, manda el código y se corrige el documento en la misma tarea.

| Contrato | Entre | Documento | Código |
|---|---|---|---|
| Simulation API | UI host ⇄ Engine host (Worker/servidor) | [simulation-api.md](simulation-api.md) | `protocol.ts` |
| Render API | Engine → Render | [render-api.md](render-api.md) | `frame.ts` |
| Command API | Dios/CLI → Engine | [command-api.md](command-api.md) | `commands.ts`, `criteria.ts` |
| World Store | Hosts → persistencia | [world-store.md](world-store.md) | `manifest.ts`, `snapshot.ts`, `store.ts` |
| Map-pack | `almensilla-3d` → Engine/Render | [map-pack.md](map-pack.md) | `mappack.ts` |

Reglas generales:
1. Todo lo que cruza una frontera es serializable (structured clone / JSON). Nada de clases ni funciones.
2. Cambio incompatible en el protocolo ⇒ subir `PROTOCOL_VERSION`. Cambio en el estado ⇒ subir `ENGINE_VERSION`.
3. El render y la UI **nunca** importan `@worldopen/engine` directamente salvo el host del motor (Worker/CLI).
