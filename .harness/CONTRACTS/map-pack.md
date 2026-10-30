# Map-pack (`almensilla-3d` → WorldOpen)

Código: `packages/contracts/src/mappack.ts` (tipos), `packages/engine/src/map/mappack.ts` (lector validador).
Decisiones: ADR-0007 (anonimización, multi-región) y ADR-0017 (map-packs reales).

## Estructura (esquema 1)
```text
<id>-<version>/
├── manifest.json            MapPackManifest (crs = marco local, sin origen absoluto)
├── logic/
│   ├── buildings.json       BuildingRecord[] con huella (footprint), cota (baseY), altura (heightM) y portal
│   └── streets.json         StreetGraph peatonal, una sola componente conexa; nombres inventados
└── render/
    ├── terrain.glb · roads.glb   GLB del pipeline con los metadatos (`extras`) eliminados
    ├── trees.json                [x, z, tipo, escala, y, anchura] sin fuente ni origen
    └── heights.json              HeightGrid: cotas de la malla del terreno (celda de 20 m)
```
Lo genera `almensilla-3d` (`python -P tools/gis/run_pipeline.py --only logic pack`) en
`data/export/mappack/<id>-<version>/`. Se publica como asset de una Release; en WorldOpen se instala con
`worldopen mappack install <carpeta>` en `data/map-packs/` (ignorado por Git), que lo valida al copiar.

## Reglas
1. **Anonimización obligatoria (doble barrera):** `pack_map.py` audita todos los ficheros (y el JSON de los GLB) y
   borra el paquete si encuentra el nombre del municipio o de vecinos, un nombre real de calle, una referencia
   catastral o el código INE; el lector del motor vuelve a rechazar rastros reales al cargar.
2. **Sin origen absoluto:** coordenadas en el marco local (x = Este, z = −Norte, metros). Publicar el origen EPSG
   geolocalizaría el lugar real. Las regiones de un mundo se colocan con `RegionRef.offset`.
3. Ids opacos con prefijo de región (`r1-b0000`); la tabla refcat → id queda en `almensilla-3d/data/processed`, privada.
   Los ids de nodo de cada región se desplazan (`r2` → +1 000 000) para no chocar.
4. Los nombres de calle son inventados y estables: mismo nombre real → mismo nombre inventado (hash con sal).
5. `logic/` es JSON plano sin dependencias de render. `navGrid` es opcional (el motor navega por el grafo).
6. El render dibuja los edificios desde `footprint` (no hay GLB de edificios: sus nodos llevaban la refcat).
