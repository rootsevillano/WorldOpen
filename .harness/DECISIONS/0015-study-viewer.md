# ADR-0015 · Visor de estudio

**Estado:** Aceptada · 2026-10-29 · Fuente: T5, V1 (C: herramienta de estudio)

## Contexto
Los mundos guardados deben poder reproducirse en un visor "en modo de estudio", con los parámetros que se fueron dando.

## Decisión
- **El replay lo hace el host del motor** (modo `replay`, protocolo v4), igual que la persistencia (ADR-0013):
  `replay {worldId}` abre el mundo desde su primer snapshot con el log completo, en solo lectura y sin pasar del último
  tick grabado; `seek {tick}` avanza si el destino está a menos de un día y, si no, restaura el snapshot anterior
  más cercano (los saltos obsoletos se descartan).
- **Análisis en segundo plano:** `analyze {everyTicks, metrics}` reproduce el mundo entero en otra `Simulation`
  (`engine/src/study.ts`, `ReplayAnalysis`), intercalado con la reproducción (media porción de CPU), y publica series
  de métricas (`series`) y la **verificación** del replay contra el hash de cada snapshot guardado.
- Las métricas viven en el motor (`engine/src/metrics.ts`): las comparten Behavior Gates, CLI y visor.
- **UI:** línea de tiempo con marcadores de cada intervención de Dios (llevan al tick siguiente, cuando ya se ve el
  efecto), velocidades hasta "máx", gráficas pequeñas múltiples (una escala por gráfica, nunca doble eje; paleta
  categórica validada con el script de la guía de visualización), cursor del replay, cruz con tooltip, clic para
  saltar, descarga CSV. El inspector y "seguir" funcionan en el replay.
- **CLI:** `worldopen study <worldId>` exporta las mismas series en CSV.
- **Hash de estado sin la cola de comandos pendientes:** en un replay la cola ya contiene comandos futuros que en la
  ejecución original aún no se habían enviado; incluirla hacía fallar la verificación de snapshots anteriores al
  último comando aunque el mundo fuera idéntico (hallado por el propio visor). Cambia el hash ⇒ motor 0.4.0.

## Consecuencias
- Los mundos grabados con el motor 0.3.0 no se pueden reproducir (mensaje claro en la UI). Un replay exacto exige la
  misma versión del motor (ADR-0004); para conservar mundos entre versiones haría falta migrar snapshots.
- El análisis cuesta una reproducción completa: con 200 habitantes, ≈ 1 semana de juego en unos segundos.
