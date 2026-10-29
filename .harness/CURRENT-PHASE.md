# CURRENT PHASE

**Fase actual:** Fase 2b — Mapa real · 🟡 **casi completa** (2026-10-29) · ⏸️ revisión del usuario

## Hecho
- `almensilla-3d` (sin commits; el Git de ese repo lo gestiona el usuario): `tools/gis/build_logic.py` (edificios con
  huella, cota y portal real; grafo peatonal conexo; rejilla de cotas) y `tools/gis/pack_map.py` (map-pack anonimizado:
  ids opacos, calles con nombres inventados, sin origen absoluto, GLB sin metadatos; falla si queda algo real).
  Pasos `logic` y `pack` en `run_pipeline.py`; `tests/test_mappack.py` (9 tests; 43 en total en verde).
- WorldOpen: lector validador de map-packs en el motor, resolvedor de mapas en el host (Worker por fetch, CLI y
  servidor desde disco), `worldopen mappack install/list`, `--map-pack` en simulate/gate/servidor, render del mapa
  real (huellas extruidas, terreno, viales, árboles, cotas), selección de mapa al crear mundo.
- Modelo: trabajo y ocio con decaimiento por distancia (motor 0.5.0). Behavior Gate 8/8 en mapa sintético y real.
- 106 tests en verde. Visual: pueblo real dibujado, habitantes en sus calles, incendio en edificio real.

## Pendiente
- ADR-0017 (map-packs reales: sin origen absoluto, decaimiento por distancia) y actualizar CONTRACTS/map-pack.md,
  STATE.md, README y `.claude/MEMORY.md` de almensilla-3d.
- Añadir `data/export/logic/` y `data/export/mappack/` al .gitignore de almensilla-3d (D7: el pack va en Releases).
- Script `gate:real` (Behavior Gate + perf sobre el map-pack instalado; no en CI: el pack no está en el repo).
