# ADR-0017 · Map-packs reales y modelo sensible a la distancia

**Estado:** Aceptada · 2026-10-30 · Fuente: D1–D3, D7, V5, ADR-0007

## Contexto
La Fase 2b conecta el mapeado real de `almensilla-3d`. Al inspeccionar sus salidas aparecieron rastros reales que la
anonimización de ADR-0007 no había previsto: el GLB de viales lleva en sus metadatos el nombre del fichero OSM (con el
del municipio), el de terreno el código INE, el JSON de árboles las coordenadas absolutas del origen, y los nodos del
GLB de edificios la referencia catastral. Además, sobre el término real los trayectos a pie llegaban a 4 km.

## Decisión
1. **Pipeline (en `almensilla-3d`, sin tocar los GLB existentes):** `build_logic.py` (edificios con huella, cota,
   altura y portal real asociado por referencia catastral; grafo peatonal partido en los cruces antes de simplificar y
   reducido a la mayor componente conexa; rejilla de cotas) y `pack_map.py` (ids opacos, nombres de calle inventados,
   GLB sin `extras`, árboles sin fuente ni origen, auditoría que borra el paquete si queda algo real). Con tests que
   comprueban que la auditoría **detecta** datos reales en las fuentes sin limpiar.
2. **Sin origen absoluto en el map-pack**; marco local y `RegionRef.offset` entre regiones.
3. **Edificios dibujados desde la huella** (no se publica el GLB de edificios). Terreno, viales y árboles del pack.
4. **Carga:** lector validador en el motor (puro); resolvedor de mapas como dependencia del host
   (`HostOptions.resolveMaps`): `fetch` en el Worker, disco en CLI y servidor.
5. **Modelo:** el puesto de trabajo y el local de ocio se eligen con peso 1/(1 + (d/escala)²) (600 m y 400 m),
   determinista. Motor 0.5.0 (los mundos de la 0.4.0 no se pueden reproducir).
6. **Behavior Gates válidos en ambos mapas:** las aserciones miden comportamientos (ocio que desaparece con calor, sed
   sostenida sin agua corriente, vivienda más poblada en el incendio) y no valores propios de una geometría.
   `npm run gate:real` los ejecuta sobre el map-pack instalado (fuera de la CI: el pack no está en el repositorio).

## Consecuencias
- Cualquier persona con SIG puede reconocer la forma del pueblo: la línea roja de V5 protege nombres e identificadores,
  no la geometría (el mapeado real fue una decisión del usuario, D1).
- Con 200 habitantes solo ~7 % de las viviendas reales están ocupadas; con 2 000, 523 ticks/s (objetivo ≥ 20).
