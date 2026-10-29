# CURRENT PHASE

**Fase actual:** Fase 1 — Harness & Foundation · ✅ **completada** (2026-10-29) · ⏸️ pendiente de revisión del usuario (O3)
**Siguiente:** Fase 2 — MVP de supervivencia

## Fase 1 — entregado
- Respuestas de `DISCOVERY_INTERROGATION.md` incorporadas a `MEMORY.md` y a 11 ADR (`DECISIONS/`).
- Contratos (`CONTRACTS/` + `packages/contracts`): Simulation API, Render API, Command API, World Store, Map-pack.
- Esqueleto: monorepo npm (contracts, engine, render, cli, web), motor en Web Worker, CLI headless, gates y CI.

## Fase 2 — plan propuesto
Objetivo (master prompt): un tick en el que **5 entidades** en el mapa 3D toman decisiones de movimiento según una
necesidad básica (buscar cobijo), comunicándose Worker ⇄ Render.

1. **`almensilla-3d`** (repo aparte): pasos de pipeline `build_logic_buildings.py`, `build_street_graph.py`,
   `build_nav_grid.py`, `pack_map.py` + tests, con anonimización (ids opacos, sin nombres reales). Requiere acceso de
   escritura a ese repo.
2. WorldOpen: cargador de map-pack (`logic/` en el motor, `render/` en el render) con test de nombres prohibidos.
3. Motor: necesidades (cobijo + energía), Utility AI mínima, rutas A* sobre el grafo de calles, movimiento por tick.
4. Comandos `agent.spawn` / `agent.remove`; población de 5 agentes ficticios con hogar asignado.
5. Render: GLB del map-pack + agentes interpolados entre frames.
6. Behavior Gate: "al anochecer ≥ 80 % de los agentes está en su hogar" (5 seeds). Visual Gate con capturas.

## Bloqueos / decisiones abiertas
- **Acceso a `almensilla-3d`**: es privado; en su día el push falló por credenciales. La Fase 2 necesita añadirle pasos
  al pipeline (o bien que el usuario lo clone aquí). Sin eso, la Fase 2 puede avanzar con un mapa sintético.
- **Nombre ficticio del pueblo**: provisional "Valdeolivo" (`engine/src/manifest.ts`). El usuario puede cambiarlo.
- **Invitados con usuario/contraseña**: el modelo de roles existe y está probado en el motor; el login real requiere
  servidor y se hará en la fase "mundo vivo con la pestaña cerrada" (ADR-0006).
- **Git**: repositorio inicializado con `origin` = `github.com/rootsevillano/WorldOpen`; commits locales, el push lo hace el usuario.
