# WorldOpen

Motor de simulación de mundos autónomos: una población ficticia vive, decide y reacciona en un pueblo ficticio
construido sobre un mapeado real. El administrador ("Dios") fija y cambia los criterios del mundo; los demás observan.

> Estado: **Fase 3 — MVP** completada sobre un mapa sintético: habitantes ficticios con necesidades, trabajo,
> economía de recursos (comida, agua, leña), memoria y amistades; Modo Dios con criterios, incendios, inspector y
> seguimiento; histórico de mundos guardado y **visor de estudio** (Fase 4): reproducir cualquier mundo con línea de
> tiempo, intervenciones de Dios marcadas, gráficas por hora, verificación del replay y exportación CSV.
> Visión, decisiones y estado: [`.harness/`](.harness/).

## Requisitos
- Node.js 24+

```bash
npm install
```

## Uso

```bash
npm run dev
```
Abre http://localhost:5180. HUD con fecha, población y economía; control del tiempo; panel **Mundos** (crear, abrir,
terminar; se guardan solos en el navegador); **Modo Dios** para cambiar criterios y crear habitantes. Clic en un
habitante o edificio para inspeccionarlo, seguirlo con la cámara o provocar un incendio. En **Mundos → Estudiar** se abre
el visor de estudio de cualquier mundo guardado.

```bash
npm run simulate -- --ticks 10000 --seed 7 --agents 200
```
Simulación headless (sin gráficos) con informe de métricas. Opciones: `--minutes-per-tick <n>`, `--out <informe.json>`,
`--max-ms <n>`, `--save [--end] [--name <n>]` (guarda en `data/worlds/`).

```bash
npm --workspace @worldopen/cli run worldopen -- worlds
```
Lista los mundos guardados por el CLI; `verify <worldId>` los reproduce y comprueba cada snapshot;
`study <worldId> --out series.csv` exporta sus series de métricas por hora.

## Quality Gates

```bash
npm run gate:all
```
Typecheck → unit → integration → behavior (escenarios en [`gates/behavior/`](gates/behavior/)) → rendimiento
(2 000 agentes × 10 000 ticks). Se ejecutan también
en GitHub Actions. El Visual Gate se hace en el navegador.

## Estructura

| Ruta | Qué es |
|---|---|
| `packages/contracts` | Contratos compartidos (protocolo, frames, comandos, manifiesto, map-pack) |
| `packages/engine` | Motor puro y determinista (sin DOM, sin Three.js) |
| `packages/render` | Render Three.js que solo consume `RenderFrame` |
| `packages/store` | Histórico de mundos: almacenes en memoria e IndexedDB, batería de conformidad |
| `packages/cli` | `worldopen` headless: `simulate`, `worlds`, `verify`, `study`, `gate behavior` |
| `apps/web` | Vite + React; el motor corre en un Web Worker |

## Licencia y datos
Código bajo licencia [MIT](LICENSE). Los mapas proceden de datos abiertos (IGN CC BY 4.0, Dirección General del
Catastro, © colaboradores de OpenStreetMap bajo ODbL) y conservan sus licencias. Todos los nombres de personas,
negocios, calles y lugares son ficticios.
