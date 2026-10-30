# ADR-0023 · Precios dinámicos por existencias (E1-D)

**Estado:** Aceptada · 2026-10-30 · Fuente: E1 (D en fases posteriores), ADR-0021, ADR-0022

## Decisión
1. **Precio por punto de venta:** columna `price` por edificio, un multiplicador del precio base (1 = normal, sigue
   multiplicado por `economy.priceLevel`). Solo tiendas (comida) y aserraderos (leña); el agua de las fuentes es gratis.
2. **Ajuste diario a las 06:00** (tras importaciones y exportaciones): la tienda compara sus existencias con su demanda
   (≈ 3 días de su área de influencia, ADR-0022) y el aserradero las suyas con el nivel al que exporta (20 % del
   almacén). Objetivo = 1 + 0,8 × (1 − existencias / referencia), entre 0,7× y 2,5×; cada día recorre un 25 % del camino
   (inercia: sin saltos ni oscilaciones).
3. **Elección de tienda:** un sitio el doble de caro "está" el doble de lejos (distancia × multiplicador); quien no
   puede pagar una unidad en un sitio no lo considera. Sin esto, quien podía pagar en la más barata iba a la más
   cercana y cara y no podía comprar (≈ 6 800 intentos fallidos al año en el mapa real).
4. Precio de mercado = media de los multiplicadores de los puntos en uso; lo usan la ayuda de emergencia, el HUD y las
   métricas `economy.foodPriceIndex` y `economy.woodPriceIndex`. El inspector muestra el precio de cada negocio.
5. Motor 0.11.0.

## Consecuencias
- Economía normal, un año: comida 0,94–1,06× de media (tiendas entre 0,75× y 1,46×), más cara al final del invierno;
  leña ≈ 1,0×. Sin muertes por hambre ni compras fallidas en ambos mapas.
- `food-scarcity`: la comida sube a ≈ 1,43× en dos días (escenario: ≥ 1,3); `lifecycle-year`: 0,8–1,3× al final.
- Siguen fijos el precio mayorista, el de origen, el de exportación y los salarios. Pendiente: salarios por mercado
  laboral, alquileres.
