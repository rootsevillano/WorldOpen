# ADR-0054 · Huertos en el campo

**Estado:** Aceptada · 2026-11-08 · Amplía ADR-0053 · Fuente: decisión del usuario

## Decisión
1. **Cada casa de campo tiene su huerto.**
   - Es un rectángulo de 24 × 16 m a un lado de la casa (izquierda o derecha, según un hash), alineado con la dirección
     del pueblo, a 3 m de la casa.
   - Se aparta de los demás edificios como la propia casa.
   - Contrato: `BuildingRecord.garden` (`x`, `z`, `length`, `width`, `dirX`, `dirZ`), opcional. Su cota es la de la casa.
   - El protocolo sigue en v21: el campo es opcional y no rompe a nadie.
2. **Cuidar el huerto (`Action.Tend`, «cuidar el huerto»):**
   - Cuándo: de 08:00 a 12:00 y de 18:00 a 20:30, sin noche cerrada.
   - Quién: quien vive en una casa de campo y tiene 14 años o más, si no hay nada más urgente (trabajo, colegio,
     recados, procesión…).
   - Puntuación: `(0,25 + 0,3 × estación) × buen tiempo × (½ con la despensa llena) + 0,25 si ya está en ello`. La
     estación es el factor de cosecha: 0,5 en invierno y 1,3 en verano.
   - El agente está en su casa (`location = home`) y su actividad es `Working`.
   - El frame lo saca al huerto, a un punto fijo por persona (hash del id). Se deriva y no cambia el estado.
3. **Cosecha:**
   - Cada persona en su huerto suma 0,025 raciones por minuto × estación a la despensa de su casa (unas 1,5 por hora en
     verano).
   - Llena la despensa hasta 12 raciones por residente, el doble de lo que se compra.
   - No se vende: es para casa, así que esos hogares compran menos.
4. **Colocación en el mapa real (corrige ADR-0053):**
   - Fallo: al revisar el terreno punto a punto, 24 de las 40 casas de campo de Valdeolivo estaban fuera de la malla
     del terreno.
   - Causas:
     - el catastro trae viviendas diseminadas por todo el término, así que el «casco» (90 % de las viviendas) medía
       1.570 m de radio;
     - el terreno solo cubre el término y los caminos de OSM salen fuera de él.
   - En un map-pack, el borde del casco es el cuantil 0,75 de las viviendas.
   - La casa debe tener edificios del mapa a menos de 400 m en los cuatro cuadrantes a su alrededor, es decir, estar
     dentro del término.
   - Hay 40 intentos por casa, en vez de 12.
   - Resultado: 40 casas, todas sobre el terreno con su huerto, comprobado con raycast en el navegador.
5. **Render:**
   - El huerto es una parcela de tierra labrada con surcos verdes.
   - En un map-pack se apoya sobre el punto más alto del terreno bajo el huerto. Por eso la parcela baja 3 m: así no
     quedan huecos pendiente abajo.
   - Se recoloca cuando llegan las cotas del map-pack.
6. **Métricas y versiones:** `households.gardeners` (quien cuida ahora su huerto) y `households.gardenPantry`
   (despensa por residente en las casas con huerto). Motor 0.42.0.

## Consecuencias
- **Junio, mapa sintético con 800 habitantes:**
  - salen al huerto de 5 a 13 vecinos por la mañana y al caer la tarde;
  - en tres días, su despensa llega a 7–9 raciones por persona, frente a unas 3 en el pueblo.
- **Enero:** apenas se nota.
- **Escenario `rural`:** ampliado a tres días de junio (huertos de mañana y tarde, vacíos a media tarde, despensa ≥ 5).
- La acción nueva consume números del PRNG en cada decisión, así que los mundos guardados con 0.41 no se reabren
  igual.
- `town-migration` en el mapa real depende de pocas mudanzas sorteadas. Con una versión intermedia salió 0 en una
  semilla; con la definitiva vuelve a pasar (4 y 2).
- 27/27 en ambos mapas; 192 tests.
