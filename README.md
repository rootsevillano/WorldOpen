# WorldOpen

Motor de simulación de mundos autónomos: una población ficticia vive, decide y reacciona en un pueblo ficticio
construido sobre un mapeado real. El administrador ("Dios") fija y cambia los criterios del mundo; los demás observan.

> Estado: **Fase 1 — Harness & Foundation** completada. Sin agentes todavía (llegan en la Fase 2).
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
Abre http://localhost:5180. HUD con fecha y hora de juego, control del tiempo (pausa, 1×–60×, máximo) y panel
**Modo Dios** para cambiar criterios.

```bash
npm run simulate -- --ticks 10000 --seed 7
```
Simulación headless (sin gráficos). Opciones: `--minutes-per-tick <n>`, `--out <informe.json>`.

## Quality Gates

```bash
npm run gate:all
```
Typecheck → unit → integration → behavior (escenarios en [`gates/behavior/`](gates/behavior/)). Se ejecutan también
en GitHub Actions. El Visual Gate se hace en el navegador.

## Estructura

| Ruta | Qué es |
|---|---|
| `packages/contracts` | Contratos compartidos (protocolo, frames, comandos, manifiesto, map-pack) |
| `packages/engine` | Motor puro y determinista (sin DOM, sin Three.js) |
| `packages/render` | Render Three.js que solo consume `RenderFrame` |
| `packages/cli` | `worldopen` headless: `simulate`, `gate behavior` |
| `apps/web` | Vite + React; el motor corre en un Web Worker |

## Licencia y datos
Código bajo licencia [MIT](LICENSE). Los mapas proceden de datos abiertos (IGN CC BY 4.0, Dirección General del
Catastro, © colaboradores de OpenStreetMap bajo ODbL) y conservan sus licencias. Todos los nombres de personas,
negocios, calles y lugares son ficticios.
