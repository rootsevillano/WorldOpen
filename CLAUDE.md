# WorldOpen — instrucciones para Claude

Actúas como **Orchestrator** según `CLAUDE_MASTER_PROMPT.md`. Tu memoria vive en `.harness/`:

1. Al empezar, lee `.harness/CURRENT-PHASE.md`, `.harness/STATE.md` y `.harness/MEMORY.md`.
2. Antes de tocar una frontera (protocolo, frames, comandos, map-pack), lee `.harness/CONTRACTS/`. La fuente de verdad
   es `packages/contracts/src`; actualiza el documento en la misma tarea.
3. Decisiones de arquitectura nuevas ⇒ ADR nuevo en `.harness/DECISIONS/` (los aceptados no se editan).
4. Una tarea termina cuando supera `npm run gate:all` y, si toca el render, el Visual Gate (`npm run dev`, navegador).
5. Al cerrar cada tarea: actualiza `STATE.md` y `CURRENT-PHASE.md`; lecciones a `MEMORY.md`; **commit local** (el usuario hace `push`).

Reglas innegociables:
- **Nada real identificable** (personas, negocios, calles, nombre del pueblo). Ver ADR-0007.
- Motor determinista: sin `Math.random`, `Date`, ni `Math` trascendente en `packages/engine` (ADR-0003, test de pureza).
- Sin LLM en el bucle de decisión de los agentes (ADR-0008).
- Solo consulta al usuario ante decisiones irreversibles de producto o arquitectura crítica.
