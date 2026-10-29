# CURRENT PHASE

**Fase actual:** Fase 2 — MVP de supervivencia · ✅ **completada con mapa sintético** (2026-10-29) · ⏸️ revisión del usuario (O3)
**Siguiente:** Fase 2b — conectar el mapa real (`almensilla-3d`) · después, Fase 3 — MVP completo

## Fase 2 — entregado
Objetivo del master prompt cumplido sobre el mapa sintético: 5 habitantes deciden moverse según sus necesidades
(cobijo, energía, social) y el render 3D lo muestra a partir de los frames del Worker.
- Behavior Gates de los comportamientos V4 (1) ciclo diario y (2) reacción colectiva a un evento divino (ola de calor).
- Decisión del usuario (2026-10-29): empezar con mapa sintético mientras se resuelve el acceso a `almensilla-3d`.

## Fase 2b — map-pack real (plan)
1. En `almensilla-3d`: `build_logic_buildings.py` (tabla de edificios con ids opacos y portales de AD),
   `build_street_graph.py` (grafo desde `osm_roads.geojson`), `pack_map.py` (+ test de nombres prohibidos).
2. En WorldOpen: cargador de map-pack (descarga a `data/map-packs/`, validación de esquema y nombres prohibidos) que
   pasa `MapLogic` por `SimulationOptions.maps`; el render carga los GLB de `render/` en vez de volúmenes.
3. Repetir los Behavior Gates sobre el mapa real (las distancias son mayores: revisar umbrales de cobijo).

## Fase 3 — MVP completo (propuesta, por orden)
1. WorldStore (IndexedDB + ficheros) e histórico de mundos (T5).
2. Inspector de agente/edificio y "seguir" con la cámara (G1).
3. Economía de recursos (comida, agua, madera) → V4 (3): escasez que provoca colas o desplazamientos.
4. Memoria acotada y relaciones (S6); `disaster.fire` (G1).
5. Escala a 2 000 agentes con LOD de simulación y medición en el navegador.

## Bloqueos / decisiones abiertas
- **Acceso a `almensilla-3d`** (privado) para la Fase 2b.
- **Nombre ficticio del pueblo:** provisional "Valdeolivo".
- **Login de invitados:** requiere servidor (ADR-0006).
- Ajuste fino de la Utility AI: hoy la gente se acuesta pronto (19–21 h) y el cobijo no llega a ser crítico en un
  pueblo pequeño; se recalibrará con el mapa real y la economía.
