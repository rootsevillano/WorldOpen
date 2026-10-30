# CURRENT PHASE

**Fase actual:** Hogares, parejas y migración · ✅ **completada** (2026-10-30) · ⏸️ revisión del usuario (O3)

## Hogares — entregado (ADR-0020)
- Hogar explícito, parejas que se forman entre amigos y se van a vivir juntas, emancipación, emigración de jóvenes
  solteros e inmigración a viviendas libres; criterios `society.immigration` y `society.emigration`.
- Behavior 13/13 en ambos mapas (nuevo `households-year`); 120 tests. Motor 0.8.0.

## Ciclo de vida (anterior) — completado

### ADR-0019
- Cumpleaños con etapas, embarazos y nacimientos, muertes por edad y por hambre, duelo; criterios de natalidad y
  mortalidad en el Modo Dios. Economía corregida para sostenerse años (6 defectos hallados al simular a largo plazo).
- Behavior 12/12 en ambos mapas (nuevo `lifecycle-year`); 115 tests. Motor 0.7.0.

## Calibración (anterior) — completada
**Anterior:** Fase 2b — Mapa real (completada)

## Calibración — entregado (ADR-0018)
- Población por hogares con pirámide de edades; niños en casa y estudiantes en la escuela; cronotipos de sueño y noche
  con horario español; reparto de cosechas por agricultores; mostradores por tamaño y cierre de colas. Motor 0.6.0.
- Behavior Gate 11/11 en mapa sintético y real (3 escenarios nuevos); 6 000 habitantes ≈ 185 ticks/s.

## Fase 2b — entregado (ADR-0017)
- `almensilla-3d` (sin commits; su Git lo gestiona el usuario): `build_logic.py`, `pack_map.py`, pasos `logic` y
  `pack` en `run_pipeline.py`, `tests/test_mappack.py`; `data/export/logic/` y `data/export/mappack/` ignorados (D7).
- WorldOpen: lector validador, resolvedores (Worker/CLI/servidor), `worldopen mappack install/list`, `--map-pack` en
  simulate, Behavior Gate y servidor, render del mapa real, elección de mapa al crear mundo, `npm run gate:real`.
- Modelo: trabajo y ocio cercanos (motor 0.5.0); Behavior Gate 8/8 en mapa sintético y real.

## Propuestas
- Publicar el map-pack como Release de `almensilla-3d` (decisión y acción del usuario: el repo es suyo).
- Despliegue del servidor (HTTPS, servicio, copias de `data/server/`).
- Ortofoto en el map-pack (pesa ~100 MB: valorar teselas de baja resolución).
- Siguiente modelo: caducidad de alimentos y tope de producción, dinero y empleo (E1-C), vehículos; LOD si se pasa de 6 000.

## Bloqueos / decisiones abiertas
- Nombre ficticio del pueblo: "Valdeolivo" (parámetro `--name` de `pack_map.py`).
- Exponer el servidor fuera del equipo exige HTTPS.
