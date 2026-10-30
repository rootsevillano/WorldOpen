# ADR-0020 · Hogares, parejas y migración

**Estado:** Aceptada · 2026-10-30 · Fuente: S5, S7, D4, ADR-0019

## Contexto
Con el ciclo de vida (ADR-0019) la población envejecía sin renovarse: solo nacían hijos de las parejas iniciales, nadie
formaba un hogar nuevo y las viviendas que quedaban vacías no volvían a ocuparse. Además, "familia" era "quien vive en
el mismo edificio", lo que en un bloque de pisos emparentaba a todos los vecinos.

## Decisión
1. **Hogar explícito:** columna `household` por agente (y `nextHousehold` en el snapshot). Una vivienda catastral
   alberga un hogar; un edificio con `dwellings` viviendas, otros tantos. Familia = quien comparte hogar.
2. **Pareja:** relación `partner` (no se sustituye por conocidos, como la familia). En la población inicial, los dos
   primeros miembros de los hogares de 2+ suelen ser pareja (30 % de los de 2 y 12 % de los de 3+ son monoparentales o
   un mayor con un hijo adulto; 5 % de parejas del mismo sexo). El embarazo exige convivir con una pareja masculina.
3. **Formación de parejas:** amigos solteros de 18–60 años, afinidad ≥ 0.6 y ≤ 12 años de diferencia; probabilidad
   diaria 1/120 (entre amistades del mismo sexo, ×0.05).
4. **Convivencia:** una pareja que no convive se muda a casa de quien vive sin otros adultos o, si no, a una vivienda
   libre cercana (hogar nuevo). Quien se muda lleva su parte de la despensa; si era el único adulto, sus hijos van con él.
5. **Emancipación y emigración:** solteros de 25+ que viven con sus padres se independizan (25 % anual) si hay vivienda
   libre. Solteros de 18–40 emigran (8 % anual × `society.emigration`; ×3 si viven con sus padres y no hay vivienda
   libre). Los menores que se quedan sin adultos se van con familia de fuera (`reason: orphan`).
6. **Inmigración:** llegan hogares (2 % de la población al año × `society.immigration`, tamaños y edades como la
   población inicial) solo a viviendas libres.
7. Todo una vez al día, a medianoche, tras el ciclo de vida (sistema `households`). Eventos `couple.formed`,
   `household.moved`, `household.arrived`, `agent.emigrated`. Motor 0.8.0.

## Consecuencias
- 2 años, 1 000 habitantes en el mapa sintético (sin viviendas libres): 1 000 → 982; mapa real, 1 año, 2 000
  habitantes: 2 005 → 2 025 con 47 parejas, 76 mudanzas y 15 hogares llegados. ≈ 70 % de adultos con pareja.
- El mapa sintético tiene menos viviendas (227) que hogares (≈ 400 con 1 000 habitantes): se comparten y no hay
  inmigración; en el mapa real sobran viviendas.
- Métricas `agents.partneredRatio`, `households.count`, `households.occupancy`; escenario `households-year`.
- Pendiente: divorcios, parejas que se forman fuera de los locales, vivienda por precio (con dinero, E1-C).
