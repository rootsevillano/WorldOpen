# WorldOpen — DISCOVERY INTERROGATION (Fase 0)

> **Generado por:** Orchestrator · **Fecha:** 2026-10-29 · **Estado:** ✅ respondido (2026-10-29) · incorporado en `.harness/MEMORY.md` y `.harness/DECISIONS/`
>
> **Cómo responder:** escribe debajo de cada pregunta, en la línea `**Respuesta:**`.
> - Si la dejas **vacía**, se adopta la **Propuesta por defecto** del Orchestrator (marcada con ✅).
> - Puedes responder con la letra de una opción (`B`), con texto libre, o con `?` si quieres que la discutamos antes.
> - Las preguntas marcadas con 🔒 son **decisiones irreversibles o caras de revertir**: conviene que las respondas tú.
>
> Cuando termines, dímelo en el chat ("Fase 0 respondida") y arrancaré la **Fase 1**.

---

## 0. Lo que he encontrado (resumen del análisis)

### 0.1 `WorldOpen` (este repositorio)
- Carpeta local `C:\DevLocal\WorldOpen`: **no es un repositorio Git** todavía. Contiene `CLAUDE_MASTER_PROMPT.md` y
  `.harness/` con `MEMORY.md`, `CURRENT-PHASE.md`, `STATE.md` **vacíos**. No existen `CONTRACTS/` ni `DECISIONS/`.
- Remoto `github.com/rootsevillano/WorldOpen`: solo un `README.md` con el título. Sin código, sin licencia.
- Toolchain local: Node 24.14.1, npm 11.11.0, Python 3.12.9, Git 2.56, Windows 11.

### 0.2 `almensilla-3d` (repositorio base)
- **Qué es:** visor WebGL (Vite 8.3.5 + three 0.186.1, JS vanilla ESM) del término municipal de Almensilla, navegable
  en tercera persona, + **pipeline GIS en Python** reproducible (geopandas, shapely, pyproj, trimesh, rasterio) con
  34 tests de pytest y contratos de GLB. ~139 MB (GLB y ortofotos versionados en Git, sin LFS).
- **Sistema de coordenadas:** ETRS89 / UTM 29N (EPSG:25829), origen local `E0=755870, N0=4132708`;
  ejes glTF **X = Este, Y = arriba, Z = −Norte**, metros. Término municipal = unión de CadastralZoning (14.03 km²).
- **Activos exportados** (`data/export/`, copiados a `app/public/models/`):
  | Archivo | Contenido | Utilidad para el motor lógico |
  |---|---|---|
  | `almensilla_buildings.glb` (8.4 MB) | 2793 nodos `COL_<refcat>` con extras `localId`, `currentUse`, `parts`, `max_height_m` | Edificios = posibles hogares/trabajos/refugios |
  | `almensilla_roads.glb` (3.3 MB) | Superficies de vial por teselas de 500 m (`carriageway`, `track`, `pedestrian`) | **Solo superficies, no grafo**: el grafo de navegación habrá que derivarlo |
  | `almensilla_terrain.glb` (2.5 MB) | Relieve MDT05 por teselas `TERRAIN_<i>_<j>` + ortofoto PNOA | Altitud / transitabilidad |
  | `almensilla_trees.json` (2.5 MB) | ~72 000 árboles `[x,z,type,scale,y,width]`, tipos broadleaf/olive/pine/shrub | Recursos naturales (madera, sombra, olivar) |
- **Datos brutos disponibles:** Catastro INE 41010 (2798 Building con `currentUse`: 2590 residencial, 93 industrial,
  41 agrícola, 32 servicios públicos, 24 comercio, 1 oficina; `numberOfDwellings`; 10 574 BuildingPart con plantas;
  912 piscinas; 3368 direcciones/portales con 115 calles; 3822 parcelas); OSM (614 viales con `name`, `oneway`,
  `lanes`…; places y barrios); IGN (MDT05, MDS LiDAR, ortofoto PNOA).
- **Código reutilizable en el render:** `FootprintCollider` y `GroundIndex` (colisión y cota del suelo), LOD,
  niveles de calidad auto, sombras, fusión de edificios por material (~105 draw calls, ≥60 FPS a 1080p medido).
- **Huecos detectados para WorldOpen:**
  1. No hay **grafo de calles** ni **navmesh** exportados → necesario para que los agentes se desplacen.
  2. Los datos útiles para la lógica (uso, viviendas, portales, calles) viven en GLB/GML, no en un formato
     **consumible por un motor puro** (sin Three.js) → hay que definir un `world.json`/binario de mundo.
  3. Edificios singulares (iglesia, ayuntamiento, plaza) no están modelados: el proyecto anterior pidió referencias.
  4. Licencias de datos: **CC BY 4.0 (IGN)**, Catastro (atribución) y **ODbL (OSM, share-alike de bases de datos)**.

---

## 1. VISIÓN

**V1. 🔒 ¿Qué es WorldOpen en su MVP: un juego, un simulador/sandbox contemplativo o una herramienta de investigación?**
- A) Sandbox "Modo Dios" tipo WorldBox: el usuario observa e interviene, no hay objetivos ni victoria.
- B) Juego con objetivos/progresión.
- C) Herramienta de simulación social/urbana (análisis, escenarios "¿qué pasa si…?").
- ✅ Propuesta: **A**, con la puerta abierta a C (el modo headless ya lo facilita).

**Respuesta:**
Mezcla de (`A`) y (`C`). Pretende ser una simulación social/urbana que evolucionara en base a unos criterios iniciales. Algunos criterios pueden ir cambiando solos, como puede ser el tiempo (clima) y otros criterios pueden ser incluidos por por el usuario administrador o llamado de otro modo, dios. Debe de existir una utilidad o herramienta que nos permita introducir esos criterios.

**V2. ¿Quién es el público objetivo del MVP?** (tú solo / amigos / vecinos de Almensilla / público general / académico)
- ✅ Propuesta: **tú y un círculo cercano** (sin cuentas, sin servidor, todo en el navegador).

**Respuesta:**
Yo y un circulo cercano, los cuales pueden ser invitados mediante un usuario y contraseña, pero los usuarios no puden intervenir, no pueden indicar criterios, solo dios, el administrador, es el que puede incluir esos criterios.

**V3. 🔒 ¿Realismo o fantasía?** WorldBox mezcla razas, magia y desastres; Almensilla es un pueblo real.
- A) Realista contemporáneo (Almensilla hoy, personas normales).
- B) Realista histórico (p. ej. Almensilla agrícola de hace un siglo, sin coches).
- C) Fantasía sobre el mapa real (razas, magia, monstruos).
- D) Realista al inicio, con "poderes divinos" fantásticos solo en el Modo Dios.
- ✅ Propuesta: **D**.

**Respuesta:**
Mezcla de (`A`) y (`B`), con una evolución en el tiempo, pero debe de estar preparado para introducir un (`C`).

**V4. ¿Qué comportamiento emergente te haría decir "esto funciona" al final del MVP?** (describe 1–3 escenas observables;
p. ej. "al anochecer la gente vuelve a casa", "si quemo la panadería, la gente cambia de rutina", "se forma un atasco en la plaza").
- ✅ Propuesta: (1) ciclo diario casa↔trabajo↔ocio visible; (2) reacción colectiva a un evento divino (huida/refugio);
  (3) un recurso escaso provoca colas o desplazamientos a otra zona.

**Respuesta:**
Aceptamos la propuesta.

**V5. ¿Hay alguna línea roja de contenido?** (muerte visible de personajes, violencia, religión, política local, nombres
reales de vecinos/negocios…)
- ✅ Propuesta: muerte permitida pero abstracta (sin gore); **nunca** nombres de personas reales; negocios genéricos por tipo.

**Respuesta:**
Nunca se pueden identificar personas o nombres reales, todo tiene que ser ficticio, tanto personajes como negocios. Es importante tener en cuenta esto, es una línea que no se puede sobrepasar. Por otro lado, es importante cambiar el nombre del pueblo, tiene que ser igualmente un pueblo ficticio, nos basemos en el mapeado real pero con nombre ficticio.

**V6. 🔒 ¿Nombre del producto y licencia del código?** "WorldOpen" sugiere código abierto.
- A) MIT · B) Apache-2.0 · C) GPL-3.0/AGPL · D) Privado por ahora.
- ✅ Propuesta: **MIT** para el código; los datos derivados mantienen sus licencias (ODbL/CC BY) en una carpeta aparte.

**Respuesta:**
Aceptamos la propuesta.

---

## 2. SOCIEDAD (agentes y emergencia)

**S1. 🔒 ¿Cuántos agentes simulados en el MVP?** Determina toda la arquitectura (ECS, estructuras de datos, LOD de simulación).
- A) Decenas (≤100) · B) Cientos (≤2 000) · C) Escala real (~6 000 habitantes de Almensilla) · D) Decenas de miles.
- ✅ Propuesta: **Fase 2 = 5 (como pide el plan); MVP = hasta 2 000; arquitectura diseñada para 10 000** (ECS con
  TypedArrays + LOD de simulación: los agentes lejos de la cámara se simulan a menor frecuencia).

**Respuesta:**
Aceptamos la propuesta.

**S2. ¿Qué tipos de entidades existen en el MVP?**
- [ ] Humanos · [ ] Animales domésticos · [ ] Fauna (aves, conejos…) · [ ] Ganado · [ ] Vehículos · [ ] Otras razas/criaturas
- ✅ Propuesta: **solo humanos** en el MVP; animales y vehículos en fases posteriores.

**Respuesta:**
Aceptamos la propuesta.

**S3. ¿Qué necesidades básicas tienen los agentes?** (modelo Utility AI tipo Maslow simplificado)
- ✅ Propuesta: **Hambre, Energía/sueño, Cobijo/seguridad, Social, Dinero/trabajo**. (5 ejes, valores 0–1.)

**Respuesta:**
Aceptamos la propuesta.

**S4. ¿Qué rasgos individuales diferencian a los agentes?**
- ✅ Propuesta: edad, sexo, rasgos de personalidad (2–3 ejes: sociabilidad, laboriosidad, valentía), salud,
  ocupación, hogar asignado. Nombres generados (no reales).

**Respuesta:**
Aceptamos la propuesta.

**S5. ¿Ciclo de vida completo en el MVP?** (nacimiento, envejecimiento, parejas, hijos, muerte)
- A) Sí, completo · B) Solo envejecimiento y muerte · C) No: población fija.
- ✅ Propuesta: **C en el MVP** (población fija, seed determinista); ciclo de vida en la siguiente iteración.

**Respuesta:**
Aceptamos la propuesta.

**S6. ¿Memoria y relaciones sociales?**
- ✅ Propuesta: memoria acotada por agente (últimos N eventos relevantes + lugares conocidos) y grafo de relaciones
  simple (familia, vecino, compañero, amigo) con afinidad −1..1.

**Respuesta:**
Aceptamos la propuesta.

**S7. ¿Estructuras colectivas en el MVP?** (familias/hogares, gremios, ayuntamiento, facciones, religión, conflictos)
- ✅ Propuesta: **solo hogares/familias**; instituciones y facciones como comportamiento emergente posterior.

**Respuesta:**
Aceptamos la propuesta.

**S8. 🔒 ¿Arquitectura de IA de los agentes?** (el master prompt prohíbe LLMs tick a tick)
- A) Utility AI (elige la acción que más reduce la necesidad dominante) · B) Behavior Trees · C) GOAP · D) Híbrida.
- ✅ Propuesta: **D — Utility AI para *qué* hacer + máquinas de estado/BT pequeños para *cómo* hacerlo**;
  GOAP queda reservado para planes multi‑paso (economía) si hace falta.

**Respuesta:**
Aceptamos la propuesta.

**S9. ¿Se permite usar un LLM fuera del bucle de simulación?** (p. ej. generar crónicas/diarios del pueblo, nombres,
biografías, narrar lo ocurrido; nunca decisiones)
- A) No, nada de LLM · B) Sí, opcional y desactivable, solo para narración.
- ✅ Propuesta: **A en el MVP**; B como módulo opcional posterior.

**Respuesta:**
Aceptamos la propuesta.

---

## 3. TIEMPO

**T1. 🔒 ¿Qué representa un tick?**
- A) 1 segundo de juego · B) 1 minuto de juego · C) 10 minutos · D) Variable.
- ✅ Propuesta: **1 tick = 1 minuto de juego** (1 día = 1 440 ticks). Movimiento interpolado en el render entre ticks.

**Respuesta:**
Aceptamos la propuesta, pero debemos de preparlo para cambiar el tiempo de los ticks.

**T2. ¿Relación tiempo real ↔ tiempo de juego por defecto?**
- ✅ Propuesta: velocidad 1× = 1 día de juego en **24 min reales** (1 tick/s); controles de pausa, 1×, 5×, 20×, máximo.

**Respuesta:**
Aceptamos la propuesta, pero debemos de preparlo para cambiar la velocidad.

**T3. ¿Ciclo día/noche y estaciones?**
- ✅ Propuesta: día/noche **sí** (sol real de Almensilla por latitud/fecha, ya hay sombras en el visor);
  calendario con estaciones **sí**; clima (lluvia, calor extremo) como evento simple.

**Respuesta:**
Aceptamos la propuesta.

**T4. 🔒 ¿Determinismo estricto?** (misma seed + mismos comandos ⇒ mismo mundo, bit a bit)
- ✅ Propuesta: **Sí**. Permite reproducir bugs, Behavior Gates fiables en CI y repeticiones/replays. Implica PRNG con
  seed propia, sin `Math.random()`, sin `Date.now()` en la lógica y orden de iteración fijo.

**Respuesta:**
Aceptamos la propuesta.

**T5. ¿Persistencia del mundo?**
- A) Sin guardado · B) Guardar/cargar manual (archivo) · C) Autoguardado en el navegador · D) B + C.
- ✅ Propuesta: **D** (snapshot serializado + log de comandos; IndexedDB en el navegador, archivo en el CLI).

**Respuesta:**
Aceptamos la propuesta, pero debemos de prepararlo para disponer de un siste de guarado historico, así como la identificación de distintos mundos. Para esta segunda fase que indico y que ejecutaremos mas adelante, lo decir que puedo comenzar un mundo y terminar, pero todo debe de quedar almacenado en algún sistema, base de datos, archivos txt o cualquir otro formato que determinemos en el momento, pero identificando el mundo por si mas adelante quisieramos poder reproducir ese mundo en un "visor" que desarrollaremos destinado a este visionado de mundos, con los distintos parametros que se hayan ido dando, en modo de estudio.

**T6. ¿El mundo debe "vivir" mientras la pestaña está cerrada?** (simulación en servidor)
- ✅ Propuesta: **No en el MVP**. Al reabrir, opción "avanzar N días" ejecutando el motor en modo rápido (headless).

**Respuesta:**
Aceptamos la propuesta, pero debemos de prepararlo para una siguiente fase en la que el mudo vivira mientras la pestaña este cerrada.

---

## 4. ECONOMÍA

**E1. 🔒 ¿Hay economía en el MVP?**
- A) No (solo necesidades físicas) · B) Recursos sin dinero (trueque/stock) · C) Dinero + empleo + precios · D) Mercado con oferta/demanda dinámica.
- ✅ Propuesta: **B en el MVP** (comida y materiales como stock en edificios), C/D en fases posteriores.

**Respuesta:**
Aceptamos la propuesta.

**E2. ¿Qué recursos existen?**
- ✅ Propuesta MVP: **Comida, Agua, Madera** (los 72 000 árboles y el olivar dan una base real), Herramientas más adelante.

**Respuesta:**
Aceptamos la propuesta.

**E3. ¿Cómo se asignan funciones a los edificios reales?** El Catastro solo dice "residencial/industrial/agrícola/
servicios/comercio/oficina".
- A) Solo con el `currentUse` de Catastro (comercio = tienda genérica, servicios públicos = edificio público genérico).
- B) Catastro + OSM (`amenity`, `shop`) donde exista.
- C) Catastro + OSM + un archivo de **overrides manual** que tú rellenas (p. ej. "este refcat es la panadería").
- ✅ Propuesta: **C**, empezando por A/B y añadiendo overrides solo cuando un comportamiento lo pida.

**Respuesta:**
Aceptamos la propuesta.

**E4. ¿Producción agrícola?** Almensilla tiene mucho olivar y suelo rústico en el término.
- ✅ Propuesta: el suelo rústico (polígonos catastrales) y los olivos producen comida por estación; los agentes con
  ocupación "agricultor" se desplazan a trabajarlo.

**Respuesta:**
Aceptamos la propuesta.

**E5. ¿El mundo es cerrado o hay comercio con el exterior?** (Sevilla, Mairena, Coria…)
- ✅ Propuesta: **"Exterior" abstracto**: puntos de salida en las carreteras (A-8058, SE-648…) donde los agentes
  van a trabajar/comprar fuera y vuelven; flujo de bienes como fuente/sumidero simple.

**Respuesta:**
Aceptamos la propuesta, teniendo en cuenta que tenemos pensado hacer crecer el mapa, incluyendo mas localidades, con lo cual debemos de estar preparados para posibles añadidos de localidades.

---

## 5. MODO DIOS

**G1. ¿Qué poderes debe tener el jugador en el MVP?** (marca los que quieras)
- [ ] Inspeccionar agente/edificio (ver necesidades, memoria, relaciones)
- [ ] Seguir a un agente con la cámara
- [ ] Controlar el tiempo (pausa/velocidad)
- [ ] Crear/eliminar agentes
- [ ] Modificar necesidades/recursos ("bendecir con comida")
- [ ] Desastres: incendio, inundación (Guadalquivir/arroyos), terremoto, sequía, plaga
- [ ] Clima: lluvia, ola de calor
- [ ] Construir/destruir edificios
- [ ] Encarnar a un agente (reutilizando el personaje en tercera persona de almensilla-3d)
- ✅ Propuesta MVP: **Inspeccionar, Seguir, Tiempo, Crear/eliminar agentes, Incendio, Ola de calor**.
  Encarnar a un agente = fase posterior (el controlador ya existe, pero exige sincronizar con el Worker).

**Respuesta:**
Aceptamos la propuesta.

**G2. 🔒 ¿Cómo interactúa el Modo Dios con el motor?**
- ✅ Propuesta: **todo poder es un Comando** serializable (`{tick, type, payload}`) enviado al Worker; nunca muta el
  estado directamente. Esto mantiene el determinismo, permite replays y que el CLI ejecute los mismos poderes.

**Respuesta:**
Aceptamos la propuesta, y teniendo en cuenta que se pueden ir añadiendo comandos al proyecto en función de las necesidades que veamos que vayan surgiendo, así como también podemos eliminar comandos, con lo cual hace falta una gestión para estos comandos.

**G3. ¿Pueden destruirse/modificarse los edificios reales?** (implica que la geometría 3D estática deja de serlo)
- A) No: los edificios son indestructibles en el MVP; un incendio solo cambia su estado lógico + efecto visual.
- B) Sí: geometría dinámica.
- ✅ Propuesta: **A**.

**Respuesta:**
Aceptamos la propuesta, pero preparando el proyecto para la B en una siguiente fase.

**G4. ¿Qué interfaz/estética de UI prefieres?**
- A) HUD minimalista sobre el 3D · B) Paneles tipo herramienta (inspector, gráficas de población/necesidades) · C) Estilo juego (iconos, pixel art).
- ✅ Propuesta: **A + B plegable** (React solo para paneles de UI; el 3D sigue en Three.js vanilla como en almensilla-3d).

**Respuesta:**
Aceptamos la propuesta.

**G5. ¿Cámara principal?**
- ✅ Propuesta: **cenital/órbita** (vista aérea ya existente en almensilla-3d) con zoom hasta nivel de calle;
  tercera persona solo al "seguir" o "encarnar".

**Respuesta:**
Aceptamos la propuesta.

**G6. ¿Plataformas objetivo?**
- ✅ Propuesta: **escritorio (navegador Chromium/Firefox)**; móvil/táctil fuera del MVP.

**Respuesta:**
Aceptamos la propuesta.

---

## 6. DATOS DE ALMENSILLA

**D1. 🔒 ¿Ámbito espacial del MVP?**
- A) Solo el casco urbano (~1.5 km × 1.5 km).
- B) Término municipal completo (14 km², incluye rústico y urbanizaciones).
- C) Casco + entorno inmediato.
- ✅ Propuesta: **B para el mapa y el render** (ya existe), **pero los agentes del MVP viven y se mueven en el casco**;
  el rústico se activa con la economía agrícola.

**Respuesta:**
Aceptamos la propuesta, tiendo en cuenta la C para posteriores fases.

**D2. 🔒 ¿Cómo integramos `almensilla-3d`?**
- A) Copiar (vendorizar) el pipeline y los modelos dentro de WorldOpen y evolucionarlos aquí.
- B) Mantener `almensilla-3d` como repositorio independiente y consumir sus exportaciones (submódulo Git o paquete de datos versionado).
- C) Fusionar ambos repos (WorldOpen absorbe almensilla-3d con su historia Git).
- ✅ Propuesta: **B** — `almensilla-3d` sigue siendo la "fábrica de mapas" (pipeline GIS en Python) y añade una salida
  nueva `world/` para el motor; WorldOpen la consume como **paquete de datos versionado** (`map-pack`) y reutiliza
  copiando los módulos de render que necesite. Así el motor nunca depende de Python ni de Three.js.

**Respuesta:**
Aceptamos la propuesta.

**D3. ¿Puedo añadir pasos nuevos al pipeline de `almensilla-3d`?** Hacen falta para el motor:
1. **Grafo de calles** (nodos/aristas con longitud, tipo de vía, sentido) desde los ejes OSM ya procesados.
2. **Grid de navegación** (p. ej. celdas de 2 m: transitable/edificio/agua/vial) o navmesh.
3. **Tabla lógica de edificios** (refcat, uso, viviendas, superficie, plantas, centroide, portales/entradas desde AD).
- ✅ Propuesta: **Sí**, como nuevos scripts en `tools/gis/` con sus tests, sin modificar los GLB existentes.

**Respuesta:**
Aceptamos la propuesta.

**D4. ¿Población inicial basada en datos reales?** (INE: ~6 000 habitantes; Catastro: `numberOfDwellings` por edificio)
- A) Sí: hogares distribuidos según viviendas catastrales y pirámide de edad del INE (datos agregados, públicos).
- B) No: población inventada uniforme.
- ✅ Propuesta: **A** (escalada a S1), siempre con personas ficticias.

**Respuesta:**
Aceptamos la propuesta.

**D5. ¿Puntos de interés reales?** (iglesia, ayuntamiento, colegios, plaza, centro de salud, polideportivo, bares…)
Ni Catastro ni el OSM descargado los identifican bien.
- A) Me proporcionas una lista (nombre/tipo + dirección o refcat).
- B) Los extraigo de OSM (`amenity=*`) aunque estén incompletos.
- C) Se asignan automáticamente según el uso catastral.
- ✅ Propuesta: **B + C ahora; A cuando quieras afinar**. ¿Puedes enumerar los 5–10 lugares más importantes del pueblo?

**Respuesta:**
Aceptamos la propuesta.

**D6. ¿Elementos hidrográficos/riesgos reales?** (arroyos, zonas inundables, campos)
- ✅ Propuesta: no en el MVP; añadir capas hidrográficas del IGN/CNIG cuando exista el desastre "inundación".

**Respuesta:**
Aceptamos la propuesta.

**D7. ¿Estrategia para los ~139 MB de binarios?** (almensilla-3d versiona GLB y ortofotos sin Git LFS)
- A) Git LFS · B) Generar en build y no versionar · C) Releases de GitHub como `map-pack` · D) Igual que ahora.
- ✅ Propuesta: **C** para WorldOpen (el repo de código queda ligero; el paquete de mapa se descarga/versiona aparte).

**Respuesta:**
Aceptamos la propuesta.

---

## 7. PLATAFORMA Y ARQUITECTURA (decisiones críticas)

**P1. 🔒 ¿Lenguaje del motor?**
- A) **TypeScript** (Worker en navegador + Node para el CLI, mismo código).
- B) Rust → WebAssembly (máximo rendimiento, más complejidad).
- C) JS vanilla (como almensilla-3d).
- ✅ Propuesta: **A**, con datos en TypedArrays (estructura ECS) para que portar el núcleo a Rust/WASM sea posible si
  el Behavior Gate de rendimiento lo exige.

**Respuesta:**
Aceptamos la propuesta.

**P2. ¿Stack de frontend?**
- ✅ Propuesta: **Vite + TypeScript + Three.js (render) + React (solo UI)**, monorepo con paquetes
  `engine/` (puro, sin DOM), `render/`, `ui/`, `cli/`, `contracts/`. Node 24 / npm workspaces.

**Respuesta:**
Aceptamos la propuesta.

**P3. ¿Objetivo de rendimiento?**
- ✅ Propuesta: render ≥60 FPS a 1080p (heredado); motor: **≥20 ticks/s con 2 000 agentes** en el Worker y
  **10 000 ticks headless en < 60 s** en tu equipo.

**Respuesta:**
Aceptamos la propuesta.

**P4. 🔒 ¿Git y GitHub?** La carpeta local no es repo y el remoto solo tiene un README. En almensilla-3d tú
gestionabas Git a mano.
- A) Lo gestionas tú a mano (yo no hago commits/push).
- B) Yo hago commits locales por tarea; tú haces push.
- C) Yo hago commits, push y PRs.
- ✅ Propuesta: **B**, tras clonar el remoto en esta carpeta (o `git init` + remote).

**Respuesta:**
Aceptamos la propuesta.

**P5. ¿Dónde ejecutar los Quality Gates?**
- ✅ Propuesta: localmente (scripts `npm run gate:*`) y en **GitHub Actions** (unit, integration, behavior headless);
  el Visual Gate local con el navegador integrado (capturas + métricas).

**Respuesta:**
Aceptamos la propuesta.

---

## 8. OBSERVABILIDAD Y EVALUACIÓN ODD

**O1. ¿Cómo quieres observar la emergencia?**
- ✅ Propuesta: (1) panel de métricas en vivo (población por actividad, necesidades medias, ocupación de edificios);
  (2) mapas de calor de desplazamiento; (3) log de eventos legible ("Ana se refugió en la iglesia por el incendio");
  (4) informe JSON/Markdown al final de cada simulación headless.

**Respuesta:**
Aceptamos la propuesta.

**O2. ¿Formato de los Behavior Gates?**
- ✅ Propuesta: escenarios declarativos (`seed`, `ticks`, setup, comandos, **aserciones estadísticas**), p. ej.
  "a las 23:00 ≥ 80 % de los agentes está en su hogar" sobre 5 seeds distintas.

**Respuesta:**
Aceptamos la propuesta.

**O3. ¿Con qué frecuencia quieres revisiones tuyas?**
- A) Al final de cada fase · B) Por cada comportamiento validado · C) Solo ante decisiones 🔒.
- ✅ Propuesta: **A + C**.

**Respuesta:**
Aceptamos la propuesta.

---

## 9. ALCANCE DEL MVP (resumen para validar)

Si aceptas todas las propuestas por defecto, el MVP queda así:

> **WorldOpen MVP** — Sandbox "Modo Dios" en el navegador sobre el término municipal real de Almensilla.
> Hasta 2 000 humanos ficticios con 5 necesidades, rasgos, memoria acotada y hogares asignados según el Catastro,
> deciden con Utility AI y se mueven por un grafo de calles real. Tick = 1 minuto, determinista por seed, ciclo
> día/noche y estaciones. Economía de recursos sin dinero (comida, agua, madera). El jugador inspecciona, sigue,
> controla el tiempo, crea/elimina agentes y lanza incendios y olas de calor. Motor en TypeScript en un Web Worker,
> ejecutable en headless desde el CLI (`worldopen simulate --ticks 10000`). Render Three.js reutilizando almensilla-3d.

**A1. ¿Validas este alcance? ¿Qué quitarías o añadirías?**

**Respuesta:**
He realizado observaciones.

**A2. ¿Hay algo que no te he preguntado y que es importante para ti?**

**Respuesta:**
Posible crecimiento del mapeado con otras localidades, en fases posteriores.
