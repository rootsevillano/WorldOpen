# ADR-0019 · Ciclo de vida y economía sostenible a largo plazo

**Estado:** Aceptada · 2026-10-30 · Fuente: S5 (diferido en el MVP), D4, E1, E5

## Decisión — ciclo de vida
- **Cumpleaños** (`birthDay`): la edad sube un año en su día; a los 6 se pasa a la escuela, a los 18 a buscar trabajo,
  a los 67 a la jubilación; a los 12 y 18 cambia el cronotipo.
- **Muertes:** probabilidad diaria = mortalidad anual por tramo de edad (aprox. España) / 360 × `society.mortality`;
  con la salud agotada (< 0.05), +5 % diario ("hambre"). Familia y amigos lo recuerdan (`grief`) y les baja la necesidad
  social; las relaciones con el difunto se borran. Evento `agent.died {age, cause}`.
- **Nacimientos:** mujer con pareja conviviente, fecundidad anual por tramo (TFR ≈ 1.3) × `society.fertility`;
  embarazo de 270 días (`pregnantDays`); el bebé nace en casa, es familia de los convivientes. Al crear el mundo hay
  embarazos en estado estacionario (si no, el primer año casi no nace nadie). Evento `agent.born`.
- Todo una vez al día, a medianoche, sin funciones trascendentes (tablas por tramos, ADR-0003). Motor 0.7.0.

## Decisión — economía sostenible (hallazgos al simular años)
Las simulaciones de días ocultaban hambrunas que aparecían a las semanas; se corrigieron como defectos del modelo:
1. **Importaciones del Exterior a escala de la población** (6 raciones por persona y día × `economy.foodAbundance`;
   el consumo medido es ≈ 4.3): el fin de semana sin cosechas vaciaba las tiendas y desataba una espiral (los
   agricultores hambrientos buscaban comida en vez de trabajar). Quien trabaja en una huerta come de su cosecha.
2. **Reparto por área de influencia de cada tienda y tope de 3 días por tienda:** repartir a partes iguales vaciaba las
   céntricas; un tope global las dejaba sin importaciones cuando las cosechas llenaban las periféricas.
3. **Bloques de pisos:** agua corriente y recaderos por residente (un edificio puede ser varios hogares).
4. **Atención independiente del tamaño del tick** (un mostrador atiende dt / 5 min clientes por tick).
5. **Memoria de tiendas vacías de 12 h** y reintento en la más cercana si las recuerda todas vacías.
6. **Leña anticipada** cuando las noches son frías (el aserradero abre de día).

## Consecuencias
- 2 años con 1 000 habitantes (mapa sintético): solo muertes por edad (≈ 10–14 ‰ anual) y 4–9 ‰ de nacimientos. Mapa
  real, 1 año: 7–16 ‰ de muertes por edad y casos aislados de hambre en una semilla (hogares muy alejados).
- Escenario `lifecycle-year` (300 habitantes, ×3, ticks de 10 min, que se comportan como los de 1 min) en la CI.
- Pendiente: parejas y migración (formación de hogares nuevos), caducidad de alimentos, dinero y empleo.
