# ADR-0007 · Map-packs multi-región y anonimización

**Estado:** Aceptada · 2026-10-29 · Fuente: D1, D2, D3, D7, E5, V5, A2

## Decisión
1. **`almensilla-3d` sigue siendo la fábrica de mapas** (pipeline GIS en Python). Se le añadirán pasos que generen la
   salida lógica: tabla de edificios, grafo de calles y rejilla de navegación (D3), sin tocar los GLB existentes.
2. Su salida se empaqueta como **map-pack** versionado (Releases de GitHub, D7): `manifest.json` + `logic/` (para el motor)
   + `render/` (GLB, árboles, ortofotos). Esquema en `CONTRACTS/map-pack.md`.
3. **Multi-región:** un mundo referencia **una o más regiones** (`regions[]`), cada una de un map-pack. Todas comparten un
   CRS global (EPSG:25829, metros) y cada región declara su desplazamiento respecto al origen del mundo. Añadir una
   localidad vecina = añadir un map-pack, no rehacer el mundo. Los ids lógicos llevan prefijo de región.
4. **Anonimización (línea roja V5):**
   - En el map-pack **no hay** nombres reales: ni del municipio, ni de calles, ni de negocios, ni de lugares.
     Cada región trae un `displayName` ficticio (Almensilla → "Valdeolivo", provisional).
   - Las referencias catastrales se sustituyen por ids opacos (`b000123`); la tabla de correspondencia solo existe dentro
     del pipeline de `almensilla-3d` y no se publica.
   - Nombres de calles y lugares se generan con el PRNG de la región (deterministas, ficticios).
   - Personas y negocios del motor: siempre generados. Nunca se importan nombres de OSM/Catastro.
   - La atribución de licencias (IGN, Catastro, OSM) se mantiene **sin** nombrar el municipio en la UI.
   - Un test del pipeline (y del cargador del motor) rechaza un map-pack que contenga cadenas de una lista de nombres
     reales prohibidos.

## Consecuencias
- El motor nunca depende de Python ni de Three.js; consume JSON/binario.
- Hasta que exista el primer map-pack, el motor y la UI funcionan con un mapa sintético de pruebas (`fixtures`).
