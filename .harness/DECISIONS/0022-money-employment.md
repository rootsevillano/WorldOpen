# ADR-0022 · Dinero, empleo y precios (E1-C)

**Estado:** Aceptada · 2026-10-30 · Fuente: E1 (C en fases posteriores), E5, ADR-0012, ADR-0021

## Decisión
1. **Monedero y caja:** columna `money` por agente (Float64) y `cash` por edificio. Negocios = tiendas, huertas y
   aserraderos. El Estado (funcionarios, pensiones, prestaciones, IRPF) y el Exterior (importaciones, exportaciones,
   gastos fijos, dividendos) están fuera del pueblo.
2. **Precios fijos** × `economy.priceLevel`: comida 3,4 y leña 2,2 al público; agua de las fuentes gratis; mayorista y
   precio en origen de la comida 2,2; el Exterior paga 2,2 por la cosecha y 1,8 por la leña sobrante (lo que pasa del
   20 % del almacén, a las 06:00). Comprar cobra lo que se puede pagar; sin dinero para una unidad no se intenta.
3. **Jornal diario** × `economy.wageLevel` (tienda 80, huerta 60, aserradero 66, funcionario 85): se cobra a medianoche
   entero con 5 h trabajadas, proporcional si menos (`workedToday`); lo paga el negocio con lo que tenga en caja, o el
   Estado; IRPF 15 %. Pagar por minuto trabajado dejaba a los trabajadores en déficit, porque entre trayectos y recados
   se trabajan 250–360 min por jornada.
4. **Medianoche:** gastos fijos (8 por adulto, 3 por menor, × `priceLevel`), pensión 45, prestación por desempleo 25 y
   ayuda por hijo 15 (× `economy.welfare`); el hogar reparte su dinero entre sus miembros de 14+ (quienes compran);
   ayuda de emergencia hasta un día de comida del hogar (× `welfare`, hasta 1). Herencia al hogar.
5. **Empleo** (lunes a medianoche): un negocio sin caja para media semana de nóminas despide a alguien al azar; con caja
   para cuatro y puestos libres (1 por cada 40 m²) contrata a la persona en paro más cercana; por encima de ocho semanas
   reparte beneficios. A los 18 se empieza en paro. El paro duplica la emigración de los jóvenes solteros.
6. **Tiendas con demanda:** existencias objetivo ≈ 3 días de su área de influencia (`demand`, a las 06:00); solo
   compran (importación o cosecha) hasta ahí. Sin ese límite, la tienda más cercana a las huertas compraba toda la
   cosecha, se arruinaba y dejaba de pagar a las huertas, que despedían a todos.
7. **Productividad ×1,5** (huertas 0,18 y aserraderos 0,15 por minuto y trabajador): con la producción anterior un
   jornal semanal no cubría los gastos de la semana. El excedente se exporta, así que solo cambia los ingresos.
8. **Defecto corregido:** quien iba a por un recurso se contaba a sí mismo como "alguien de casa ya va", su puntuación
   caía al 15 % y alternaba con otra acción sin llegar nunca (agentes que morían de hambre con dinero y tiendas llenas).
9. Criterios `economy.priceLevel`, `economy.wageLevel`, `economy.welfare`; eventos `job.hired`, `job.lost`,
   `purchase.unaffordable`; métricas `economy.unemploymentRate`, `economy.avgMoney`, `economy.brokeRatio`,
   `economy.businessCash`; inspector con dinero, caja y plantilla. Motor 0.10.0.

## Consecuencias
- Un año, mapa real con 2 000 habitantes (semillas 1 y 2) y sintético con 400: sin muertes por hambre, paro del 12 %
  inicial al 0–5 %, despidos de agricultores en invierno y contrataciones en aserraderos. Los hogares ahorran
  (≈ 1 700 → 3 200 de media en el mapa real).
- Escenario `money-crisis` (precios ×2,5, sin bienestar): los ahorros duran unos días y después el 40–50 % no puede
  comprar aunque las tiendas tengan comida; la salud cae.
- Umbrales: `food-scarcity` trabajando < 0,40 (antes < 0,37; con economía normal ahora 0,50–0,59) y `daily-cycle` ocio
  ≥ 0,005 a las 12:00 (una semilla daba 0,01 justa).
- Pendiente (D): precios dinámicos por oferta y demanda, alquileres, impuestos municipales.
