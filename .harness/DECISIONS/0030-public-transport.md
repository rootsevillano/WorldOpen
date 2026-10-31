# ADR-0030 · Transporte público (línea de autobús)

**Estado:** Aceptada · 2026-10-31 · Fuente: S1, ADR-0025

## Decisión
1. **Línea generada del mapa:** paradas en los nodos de calle de los locales (tiendas y servicios públicos), una por
   cada 4 (entre 4 y 10), elegidas por muestreo del punto más lejano desde el local más céntrico y ordenadas por vecino
   más cercano; el recorrido cerrado sigue las calles (A*). Si sale de menos de 2 km, el pueblo no tiene autobús (el
   mapa sintético no lo tiene; el real, 10 paradas y 14,6 km). Se reconstruye del mapa: no va en el snapshot.
2. **Autobuses sin estado:** posición = función de la hora (400 m/min ≈ 24 km/h con paradas; desfase uniforme), de
   07:00 a 22:00, uno cada 15 min × `society.transit` (nuevo, 0–3; 0 = sin servicio; nunca en la época histórica).
   En cada tick, cada autobús "cruza" las paradas de su tramo, en orden: bajan quienes llegan y suben quienes esperan
   (capacidad 60).
3. **Viajeros:** quien sale sin coche para un trayecto de 1 km o más coge el autobús si, contando ir y volver de las
   paradas (rodeo ×1,3), media espera y el viaje, tarda menos del 80 % que andando, y puede pagar el billete (1,2 ×
   `economy.priceLevel`). Etapas por agente (`transit`): a la parada (ruta hasta el nodo), esperando (visible), dentro
   (oculto, con el autobús), y al bajar sigue andando hasta su destino. Tras 40 min de espera o al acabar el servicio,
   sigue andando. Una decisión no interrumpe el viaje.
4. **Render (protocolo v7):** el frame añade `busCount`, `busPositions`, `busHeadings`; el render dibuja autobuses.
   HUD: autobuses, viajeros y esperando; inspector: "va a la parada / espera el autobús / en el autobús". Métricas
   `agents.ridingRatio`, `agents.waitingBusRatio`, `transit.buses`, `transit.stops`. Motor 0.18.0.

## Consecuencias
- Mapa real (2 000 habitantes): 2 autobuses, ≈ 290 subidas al día, ≈ 5 % desiste por la espera; la asistencia al
  trabajo no cambia (lo usan sobre todo quienes no tienen coche, para ocio y compras).
- Los escenarios del Behavior Gate no lo cubren (el mapa sintético no tiene línea): tests unitarios con una línea
  forzada (`buildLine(map, 0)`) y sondas en el mapa real. Rendimiento: mapa real 7,9 → 8,6 s.
- Pendiente: varias líneas, paradas visibles, horarios por demanda, atascos.
