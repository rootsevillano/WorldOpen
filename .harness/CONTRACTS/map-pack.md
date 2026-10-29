# Map-pack (`almensilla-3d` → WorldOpen)

Código: `packages/contracts/src/mappack.ts`. Decisión en ADR-0007.

## Estructura
```text
<id>-<version>/
├── manifest.json            MapPackManifest
├── logic/
│   ├── buildings.json       BuildingRecord[]
│   ├── streets.json         StreetGraph
│   └── navgrid.json         NavGrid (celdas de 2 m, base64)
└── render/
    ├── buildings.glb        nodos con el id opaco del edificio (hoy `COL_<refcat>` → pasará a `COL_<bId>`)
    ├── roads.glb · terrain.glb · trees.json · ortho/
```
Se publica como asset de una Release de GitHub. WorldOpen lo descarga a `data/map-packs/` (ignorado por Git).

## Reglas
1. **Anonimización obligatoria:** sin nombre del municipio, calles, negocios ni lugares reales; refcat → id opaco.
   El `displayName` es ficticio. El pipeline y el cargador del motor fallan si encuentran un nombre prohibido.
2. CRS EPSG:25829 en metros; origen y ejes declarados en `crs`. Varias regiones comparten CRS (multi-localidad).
3. Sin dependencias de Three.js en `logic/`: JSON plano.
4. El grafo de calles se deriva de los ejes OSM ya procesados por el pipeline; `y` de los nodos desde el MDT05.
5. Los ids son estables entre versiones del map-pack mientras la geometría de origen no cambie.

## Trabajo pendiente en `almensilla-3d` (Fase 2)
- `tools/gis/build_logic_buildings.py`, `build_street_graph.py`, `build_nav_grid.py`, `pack_map.py` + tests.
- Hasta entonces, WorldOpen usa un mapa sintético (`mapPack: null`): `engine/src/map/synthetic.ts`, cuadrícula de 5×5
  manzanas (74 m de paso, calles de 10 m), 100 edificios, 36 cruces; determinista por semilla y región, respeta `offset`.
- El motor ya acepta `SimulationOptions.maps` (por región) para inyectar un `MapLogic` cargado de un map-pack.
