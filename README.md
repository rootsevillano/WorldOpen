# WorldOpen

Motor de simulación de mundos autónomos: una población ficticia vive, decide y reacciona en un pueblo ficticio
construido sobre un mapeado real. El administrador ("Dios") fija y cambia los criterios del mundo; los demás observan.

> Estado: **Fase 3 — MVP** completada sobre un mapa sintético: habitantes ficticios con necesidades, trabajo,
> economía de recursos (comida, agua, leña), memoria y amistades; Modo Dios con criterios, incendios, inspector y
> seguimiento; histórico de mundos guardado y **visor de estudio** (Fase 4): reproducir cualquier mundo con línea de
> tiempo, intervenciones de Dios marcadas, gráficas por hora, verificación del replay y exportación CSV.
> **Servidor** (Fase 5): el mundo vive aunque se cierre la pestaña; acceso con usuario y contraseña; los invitados
> observan y estudian, solo Dios interviene. **Mapa real** (Fase 2b): el pueblo ficticio «Valdeolivo» sobre el
> mapeado real, desde un map-pack anonimizado.
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

## Mapa real (map-packs)

El map-pack lo genera [`almensilla-3d`](https://github.com/rootsevillano/almensilla-3d)
(`python -P tools/gis/run_pipeline.py --only logic pack`) y se instala aquí:

```bash
npm --workspace @worldopen/cli run worldopen -- mappack install C:/Github/almensilla-3d/data/export/mappack/valdeolivo-1.0.0
```
Después, al crear un mundo se elige el mapa; en el CLI y el servidor, `--map-pack valdeolivo-1.0.0`.
`npm run gate:real` pasa los escenarios y el rendimiento sobre el mapa real.

## Servidor (mundo compartido)

```bash
npm run build
```

```bash
npm run server -- user add dios --role admin
```
Crea usuarios (`admin` = Dios, `observer` = invitado que solo mira). La contraseña se pide por teclado o se toma de
`WORLDOPEN_PASSWORD`.

```bash
npm run server -- start
```
Sirve la web y el mundo vivo en http://127.0.0.1:8787. El mundo sigue corriendo aunque nadie esté conectado y se
guarda en `data/server/`. Opciones: `--port`, `--host`, `--tps` (velocidad), `--data`, `--secure` (detrás de HTTPS).
Para desarrollar la web contra el servidor: `WORLDOPEN_SERVER=http://127.0.0.1:8787 npm run dev`.

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
| `packages/host` | Host del motor (Worker y servidor) y códec del protocolo para WebSocket |
| `apps/server` | Servidor: mundo vivo compartido, acceso con usuarios, visores de estudio privados |
| `packages/store` | Histórico de mundos: almacenes en memoria e IndexedDB, batería de conformidad |
| `packages/cli` | `worldopen` headless: `simulate`, `worlds`, `verify`, `study`, `gate behavior` |
| `apps/web` | Vite + React; el motor corre en un Web Worker |

## Licencia y datos
Código bajo licencia [MIT](LICENSE). Los mapas proceden de datos abiertos (IGN CC BY 4.0, Dirección General del
Catastro, © colaboradores de OpenStreetMap bajo ODbL) y conservan sus licencias. Todos los nombres de personas,
negocios, calles y lugares son ficticios.
