# ADR-0012 · Economía de recursos sin dinero

**Estado:** Aceptada · 2026-10-29 · Fuente: E1–E5, S3, V4 (3)

## Decisión
- **Recursos:** comida, agua y leña como existencias (`Float32`) por edificio (`BuildingStore`). Las viviendas son la
  despensa del hogar (todos los residentes comparten). Sin dinero ni precios (E1 = B).
- **Fuentes de suministro:** comida → tiendas (`retail`, 08:00–21:00); agua → servicios públicos como fuentes (24 h);
  leña → aserradero (`industrial`, 08:00–20:00).
- **Producción:** por trabajador presente y minuto: huertas (`agriculture`) producen comida × `economy.foodAbundance`
  × estación y la reparten a las tiendas a las 06:00; el aserradero produce leña; las fuentes se recargan solas.
  **Exterior** (E5): importación diaria de comida por tienda × `economy.foodAbundance`.
- **Agua corriente:** recarga las despensas de agua × `economy.waterSupply` (Dios puede cortarla).
- **Consumo:** comer y beber en casa es automático (sin acción de la IA); la calefacción gasta leña por debajo de
  14 °C y, sin leña, la casa fría deja de dar cobijo.
- **Necesidades nuevas:** hambre, sed, trabajo y salud (la salud baja con hambre o sed a 0; no hay muerte en el MVP, S5).
- **Abastecerse** es una acción de la Utility AI (`Provision`): elige el recurso más urgente del hogar y la fuente
  más cercana que el agente **no recuerde vacía o en llamas** en el último día (memoria, S6). Un miembro del hogar
  abasteciéndose desanima a los demás.
- **Colas:** cada punto atiende a `2 + 2 × trabajadores` clientes a la vez (5 min por cliente); el resto espera.
- **Ocupaciones:** comercio, campo, aserradero, servicio público, paro (15 %) y jubilación (≥ 67), con puesto fijo.
  Jornada 08:00–15:00 los días 0–4 de cada semana.

## Consecuencias
- V4 (3) emerge sin programarlo explícitamente: la escasez vacía tiendas, provoca recorridos de tienda en tienda
  (desplazamientos), colas, abandono del trabajo y caída de la salud (`gates/behavior/food-scarcity`).
- El reparto "abstracto" de cosechas e importaciones (sin agentes transportistas) queda como simplificación; GOAP o
  logística con agentes es una mejora posterior.
