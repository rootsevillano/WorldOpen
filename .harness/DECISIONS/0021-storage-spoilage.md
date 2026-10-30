# ADR-0021 · Capacidad de almacén y caducidad de la comida

**Estado:** Aceptada · 2026-10-30 · Fuente: E1, E2, E5, ADR-0018, ADR-0019

## Contexto
En mundos de un año las existencias crecían sin límite: el aserradero producía mientras hubiera trabajadores (3,3
millones de leña en el mapa real con 2 000 habitantes), y los agricultores llevaban toda la cosecha a la tienda más
cercana, que acumulaba 58 000 raciones mientras otras quedaban vacías. Nadie pasaba hambre, pero ese excedente
ocultaba que en invierno, sin cosecha, las importaciones no cubrían el consumo.

## Decisión
1. **Capacidad de almacén** por superficie construida, con un mínimo: tiendas 4 raciones/m² (mín. 400), huertas
   4/m² (mín. 200), aserraderos 5 de leña/m² (mín. 300). Una huerta o un aserradero llenos dejan de producir.
2. **Reparto con hueco:** el agricultor solo reparte si alguna tienda tiene hueco para un viaje (≥ 20); va a la más
   cercana con hueco y carga como mucho lo que cabe. Las importaciones conservan su tope de 3 días por tienda.
3. **Caducidad diaria** de la comida a medianoche: tiendas 2 %, huertas 5 % (producto fresco), despensas 1 %. El agua
   y la leña no caducan.
4. **Importaciones** de 6 a 7 raciones por persona y día (× `economy.foodAbundance`, 4,9 con el valor por defecto):
   sin el excedente acumulado, el invierno vaciaba las tiendas del mapa real.
5. Métrica `economy.maxStorageRatio` (≤ 1). Motor 0.9.0.

## Consecuencias
- Mapa real, 2 000 habitantes, 14 meses, semillas 1 y 2: tiendas entre 19 000 y 49 000 raciones (10–25 por persona),
  leña acotada (≈ 110 000 en 93 naves), sin muertes por hambre. Mapa sintético: tiendas ≈ 5 000 para 400 personas.
- Parte de la cosecha se pierde cuando todo está lleno: es el coste realista de no tener precios (E1-C lo resolverá
  con dinero y demanda).
