# ADR-0031 · Transporte público solo entre pueblos

**Estado:** Aceptada · 2026-10-31 · Sustituye a ADR-0030 · Fuente: decisión del usuario, E5, ADR-0025

## Contexto
El usuario decide que el transporte público una solo pueblos distintos: dentro del pueblo se va andando o en coche.
Elegida la opción "pueblos fuera del mapa" (frente a simular varios pueblos): el mundo sigue siendo un pueblo y los
vecinos forman parte del Exterior.

## Decisión
1. **Sin línea urbana:** se retira la línea circular, la planificación de viajes dentro del pueblo y sus etapas.
2. **Carretera y autobús interurbano:** carretera del nodo de calle más alejado del centro de las viviendas (el borde
   del mapa) a una parada en el local más céntrico. El autobús llega cada hora de 07:00 a 21:00 (`society.transit`:
   2 = cada media hora; 0 = sin servicio; nunca en la época histórica), entra a 600 m/min, para 3 min y se va. Sin
   estado: su posición sale del horario (no va en el snapshot); el frame lo trae como antes (`busCount`, …).
3. **Salir del pueblo** (`transit`: a la parada, esperando, fuera, hacia el borde): en coche hasta el borde si sale de
   casa y puede llevárselo (paga la gasolina de 2 × 10 km de fuera), o andando a la parada, esperando (≤ 70 min) y
   subiendo (billete 2 × `economy.priceLevel` cada trayecto). Fuera no se dibuja, sus necesidades quedan en pausa y
   paga la comida (6). Vuelve a su hora: en coche por el borde; en autobús, en el primero que llega a partir de su hora
   (o en el último del día), y camina a casa.
4. **Trabajo en otros pueblos:** ocupación `commuter`: al crear el mundo, los parados de 18–66 años con probabilidad
   `society.commuting` (nuevo, 0–1, 0,5); cada lunes, quien siga en paro con 10 % × `society.commuting` (`job.outside`).
   Sale a su jornada y vuelve a las 15:00 (más el trayecto); el tiempo fuera cuenta como trabajado y cobra 75 al día del
   Exterior. Cuenta en `agents.workingRatio`.
5. **Excursiones:** en fin de semana, al salir de casa entre las 09:00 y las 13:00, un 8 % de los adultos (hash agente y
   día) pasa el día en otro pueblo hasta las 19:00–20:00.
6. **Visitantes:** cada autobús trae 1,5 visitantes por cada 1 000 habitantes (el doble en fin de semana) que gastan 6
   en la tienda más cercana a la parada (`bus.arrived`). No son agentes: solo su gasto (y un recuento diario para el HUD,
   transitorio).
7. Sin PRNG (hashes). Protocolo v8 (`AgentDetail.away`, `EconomySummary.bus` nuevos). Motor 0.19.0.

## Consecuencias
- Ambos mapas tienen carretera (444 m en el sintético, 5,3 km en el real): el Behavior Gate lo cubre con el escenario
  `commute` (16/16 en ambos mapas).
- Una semana: ≈ 4 % de la población trabaja fuera (el paro baja al 6–8 %), entre semana fuera de 08:00 a 15:00; en
  fin de semana, 3–6 % de excursión; a medianoche todos en casa; mitad de las salidas en coche y mitad en autobús;
  15 autobuses al día; 78 (sintético) y 406 (real) visitantes por semana.
- Pendiente: simular varios pueblos (mundos con varias regiones), visitantes como agentes, paradas visibles.
