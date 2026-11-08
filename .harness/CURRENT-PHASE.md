# CURRENT PHASE

**Fase actual:** Animales del cortijo · ✅ **completada** (2026-11-08) · ⏸️ revisión del usuario (O3)

## Animales del cortijo — entregado (ADR-0055)
- Cada casa de campo tiene un corral al otro lado del huerto (`BuildingRecord.pen`), con 4–8 gallinas y 1–3 ovejas
  (× `economy.livestock`). De día andan por el corral; de noche se recogen.
- Si vive alguien en la casa, sus huevos y su leche van cada noche a la despensa, con el tope del huerto.
- En el render, cerca de madera y cobertizo; los 40 corrales del mapa real, sobre el terreno.
- Motor 0.43.0; protocolo v21.

## Huertos en el campo (anterior) — completado (ADR-0054)
- Cada casa de campo tiene un huerto al lado, que sus vecinos cuidan por la mañana y al caer la tarde
  (`Action.Tend`); la cosecha va a la despensa. En el mapa real, las casas de campo ya caen dentro del término.
  Motor 0.42.0. 27/27 en ambos mapas; 192 tests.

## Casas de campo (anterior) — completado (ADR-0053)
- Cada pueblo tiene casas sueltas en el campo (`society.ruralHomes`, 5 %, máx. 40), con su camino de tierra; en los
  map-packs, junto a caminos del mapa y sobre el terreno. Sus hogares tienen más coche. Motor 0.41.0. 27/27 en ambos
  mapas; 191 tests.

## Entierro de la sardina (anterior) — completado (ADR-0052)
- Cuarto día del carnaval: cortejo de luto con velas a las 20:00, quema de la sardina en la plaza a las 21:30 (hoguera
  en el frame) y baile. Varias procesiones por fiesta. Protocolo v21; motor 0.40.0. 26/26 en ambos mapas; 190 tests.

## Vuelta de la romería (anterior) — completado (ADR-0051)
- A las 17:30 vuelven en procesión de la ermita a la plaza todos los vecinos que estén allí; al llegar quedan libres.
  La procesión se describe por tramos. Motor 0.39.0. 26/26 en ambos mapas; 189 tests.

## Procesión a la ermita (anterior) — completado (ADR-0050)
- El día de la romería, a las 9:00 sale de la plaza una procesión hasta la ermita por el camino, con quienes van a la
  romería. Allí se quedan y meriendan lo que llevan de casa. Motor 0.38.0. 26/26 en ambos mapas; 188 tests.

## Ermita en el campo (anterior) — completado (ADR-0049)
- Cada pueblo tiene una ermita 400 m más allá del casco, lejos de los demás pueblos, con un camino de tierra. La
  romería se hace allí y los romeros se ven en la pradera de alrededor. Motor 0.37.0. 26/26 en ambos mapas; 187 tests.

## Carnaval (anterior) — completado (ADR-0048)
- Tres días desde el 12 de febrero (se mueve por pueblo en el Modo Dios): desfile de disfraces el primero a las
  17:00, baile de disfraces las dos primeras noches y el martes festivo. La mitad de los vecinos va disfrazada
  (`AgentFlag.Costumed`, de colores en el render). Protocolo v20; motor 0.36.0. 26/26 en ambos mapas; 186 tests.

## Fechas en el Modo Dios (anterior) — completado (ADR-0047)
- Criterios `fiestas.<región>.…`: la romería de cada pueblo y las patronales de los vecinos (mes, día, duración,
  festivo). Por defecto, las fechas de su región. El Modo Dios las agrupa en «Fechas de fiestas por pueblo», con el
  nombre de cada pueblo. Protocolo v19; motor 0.35.0. 25/25 en ambos mapas; 185 tests.

## Varias fiestas al año (anterior) — completado (ADR-0046)
- Calendario por pueblo: patronales (las del primero en el Modo Dios, las de los vecinos según su región), romería
  (día festivo en el merendero) y Navidad (festivos, Nochevieja con verbena y fuegos, cabalgata de Reyes). Festivos,
  verbena, procesión, fuegos y visitantes por pueblo. Protocolo v18; motor 0.34.0. 24/24 en ambos mapas; 184 tests.

## Paradas y atascos (anterior) — completado (ADR-0045)
- Horario del autobús por pueblo según la demanda (refuerzos en hora punta, menos en pueblos pequeños), 50 plazas
  por autobús, atascos en la carretera comarcal (curva BPR, luces de freno) y marquesinas en las paradas. Protocolo
  v17; motor 0.33.0. 22/22 en ambos mapas; 182 tests.

## Procesión y fuegos (anterior) — completado (ADR-0044)
- El día grande, los vecinos se reúnen en la plaza y a las 12:00 desfilan de dos en dos detrás del paso y vuelven; la
  última noche hay fuegos artificiales sobre cada plaza. Frame con pasos y fuegos (protocolo v16); motor 0.32.0.
  21/21 en ambos mapas; 179 tests.

## Cambiar a mejor trabajo (anterior) — completado (ADR-0043)
- Una vez por semana, al salir del trabajo, quien trabaja en un negocio va a pedir un puesto que le deje un 10 % más
  de jornal neto (en su pueblo o en otro) y se cambia si la plaza sigue libre. Motor 0.31.0. 20/20 en ambos mapas;
  178 tests.

## Salarios por pueblo (anterior) — completado (ADR-0042)
- Los negocios empiezan con un salario de 0,8× a 1× según el tamaño de su pueblo. Quien busca trabajo elige el de más
  jornal neto (descontado el desplazamiento). Métricas y HUD con jornal por pueblo. Protocolo v15; motor 0.30.0.
  20/20 en ambos mapas; 177 tests.

## Buscar trabajo (anterior) — completado (ADR-0041)
- Acción `SeekJob`: en paro, en horario laboral y una vez al día, se va a pedir trabajo al negocio con puesto libre
  más cercano de su pueblo o, si no hay, de otro; si la plaza sigue libre, le contratan al llegar. Motor 0.29.0.
  20/20 en ambos mapas; 176 tests.

## Precios por pueblo (anterior) — completado (ADR-0040)
- Índice de alquiler por pueblo: ocupación × recargo por tamaño (0,6×–1×). Alquiler, cuota, compra, inversores,
  emancipación y mudanzas usan el precio del pueblo. Protocolo v14; motor 0.28.0. 19/19 en ambos mapas; 175 tests.

## Vender para mudarse (anterior) — completado (ADR-0039)
- Los propietarios que trabajan en otro pueblo venden su vivienda (a un vecino rico o al Exterior), saldan la
  hipoteca y compran en el destino al contado, con hipoteca o, si no les llega, alquilan. Motor 0.27.0. 19/19 en
  ambos mapas; 174 tests.

## Mudanzas entre pueblos (anterior) — completado (ADR-0038)
- Los hogares de alquiler que trabajan todos en otro pueblo se mudan allí (y los niños cambian de colegio). La mitad
  de quienes se irían del mundo se quedan en otro pueblo si hay casa. Criterio `society.townMigration`, evento
  `household.relocated`. Motor 0.26.0. 19/19 en ambos mapas; 171 tests.

## Vecinos de tamaño real (anterior) — completado (ADR-0037)
- Cada vecino tiene entre el 35 % y el 80 % de las viviendas del primer pueblo (`RegionRef.blocks`). El lado se
  elige al crear el mundo (este, oeste, norte, sur o alrededor), y la carretera une cada pueblo con el más cercano.
  Los nombres inventados son más naturales. Motor 0.25.0. 18/18 en ambos mapas; 170 tests.

## Varios pueblos (anterior) — completado (ADR-0036)
- Mundos de 1–3 pueblos: el mapa elegido y vecinos sintéticos al este, unidos por la carretera comarcal. Autobús,
  hostal, plaza, colegio y ocio por pueblo; trabajo en otro pueblo. Protocolo v13; motor 0.24.0. 18/18 en ambos
  mapas; 169 tests.

## Fechas de fiestas (anterior) — completado (ADR-0035)
- Mes, día de inicio, duración y día festivo de las fiestas como criterios enteros del Modo Dios; fecha de inicio
  del mundo al crearlo. Protocolo v12; motor 0.23.0. 17/17 en ambos mapas; 166 tests.

## Fiestas del pueblo (anterior) — completado

### ADR-0034
- Del 15 al 18 de agosto (el 16 festivo): verbena nocturna en la plaza, se trasnocha y se socializa el doble, el
  triple de visitantes; criterio `society.festivities`. Protocolo v11; motor 0.22.0.
- Behavior 17/17 en ambos mapas; 164 tests.

## Hostal y turismo (anterior) — completado

### ADR-0033
- El bar junto a la parada alquila habitaciones; parte de los visitantes se aloja 1–3 noches; turismo por temporada
  y criterio `society.tourism`; los huéspedes no entran en los sistemas diarios del pueblo. Protocolo v10; motor 0.21.0.
- Behavior 16/16 en ambos mapas; 161 tests.

## Visitantes como agentes (anterior) — completado

### ADR-0032
- Los visitantes bajan del autobús como agentes de paso: recorren locales del centro, gastan y charlan, y se van en
  otro autobús; no cuentan como vecinos ni entran en la vida del hogar. Protocolo v9; motor 0.20.0.
- Behavior 16/16 en ambos mapas; 158 tests.

## Transporte entre pueblos (anterior) — completado

### ADR-0031
- Sin autobús urbano. Autobús interurbano por la carretera del borde hasta el centro; vecinos que trabajan en otros
  pueblos o pasan el día fuera (en coche o autobús) y vuelven; visitantes que gastan en el centro. Protocolo v8; motor
  0.19.0. Behavior 16/16 en ambos mapas; 157 tests; Visual Gate.

## Transporte público urbano (anterior, sustituido)

### ADR-0030
- Línea circular de autobús generada del mapa (solo en pueblos con recorrido ≥ 2 km); autobuses según la hora;
  quien no tiene coche lo coge para trayectos largos si compensa. Protocolo v7; motor 0.18.0.
- 156 tests; 15/15 en ambos mapas; Visual Gate superado.

## Inspector de animales (anterior) — completado

### ADR-0029
- Los animales visibles se seleccionan en la vista; su ficha muestra tipo, edad, dueño o huerta, quién lo pasea,
  estado, paseo y producción, con enlaces. Protocolo v6; motor 0.17.0. 151 tests; 15/15 en ambos mapas.

## Herencia y compraventa (anterior) — completado

### ADR-0028
- Al morir el último adulto de un hogar, su familia de otro hogar hereda dinero, viviendas e inquilinos (o el Estado);
  las viviendas de sobra se alquilan antes que comprar otras y se venden entre particulares. Motor 0.16.0.
- Behavior 15/15 en ambos mapas; 150 tests.

## Animales (anterior) — completado

### ADR-0027
- Perros de los hogares que salen con quien va de paseo (piden paseo y comida, envejecen, se adoptan) y ganado de las
  huertas (gallinas y ovejas que deambulan de día, se recogen de noche y dan comida). Protocolo v5; motor 0.15.0.
- Behavior 15/15 en ambos mapas; 146 tests; Visual Gate superado.

## Propietarios y vivienda (anterior) — completado

### ADR-0026
- Los alquileres los cobran hogares del pueblo o fondos de fuera; los inquilinos con ahorros compran con hipoteca;
  impago de hipoteca = ejecución; los hogares ricos invierten en viviendas de alquiler; gasto discrecional que estabiliza
  los ahorros. Criterio `economy.creditAccess`. Motor 0.14.0.
- Behavior 15/15 en ambos mapas; 142 tests.

## Vehículos (anterior) — completado

### ADR-0025
- Coche por hogar; los adultos lo cogen para trayectos largos, va más rápido y gasta gasolina; el render dibuja coches
  y seleccionarlos muestra al conductor. Criterio `society.carOwnership`. Motor 0.13.0.
- Behavior 15/15 en ambos mapas (`housing-crisis` revisado); 138 tests; Visual Gate superado.

## Salarios y alquileres (anterior) — completado

### ADR-0024
- Cada negocio fija su salario según el mercado laboral (fichajes, subidas, bajadas); negocios vacíos reabren con
  capital de fuera. Hogares de alquiler con precio por ocupación, impagos y desahucios. Motor 0.12.0.
- Behavior 15/15 en ambos mapas (nuevo `housing-crisis`); 135 tests.

## Precios dinámicos (anterior) — completado

### ADR-0023
- Cada tienda y aserradero ajusta su precio a diario según sus existencias frente a su demanda; los agentes eligen
  por precio y distancia y no van donde no pueden pagar. Precios en el HUD y el inspector. Motor 0.11.0.
- Behavior 14/14 en ambos mapas; 132 tests.

## Dinero y empleo (anterior) — completado

### ADR-0022
- Monederos y cajas, precios fijos, jornal diario, pensiones y prestaciones, contratación y despido, exportaciones;
  criterios de precios, salarios y bienestar en el Modo Dios; paro, ahorros y cajas en el HUD. Motor 0.10.0.
- Behavior 14/14 en ambos mapas (nuevo `money-crisis`); 130 tests.

## Almacenes (anterior) — completado

### ADR-0021
- Capacidad de almacén por superficie, reparto de cosecha solo a tiendas con hueco, caducidad diaria de la comida e
  importaciones ajustadas (7/persona/día). Existencias acotadas; sin hambre en 14 meses en el mapa real. Motor 0.9.0.

## Hogares (anterior) — completado

### ADR-0020
- Hogar explícito, parejas que se forman entre amigos y se van a vivir juntas, emancipación, emigración de jóvenes
  solteros e inmigración a viviendas libres; criterios `society.immigration` y `society.emigration`.
- Behavior 13/13 en ambos mapas (nuevo `households-year`); 120 tests. Motor 0.8.0.

## Ciclo de vida (anterior) — completado

### ADR-0019
- Cumpleaños con etapas, embarazos y nacimientos, muertes por edad y por hambre, duelo; criterios de natalidad y
  mortalidad en el Modo Dios. Economía corregida para sostenerse años (6 defectos hallados al simular a largo plazo).
- Behavior 12/12 en ambos mapas (nuevo `lifecycle-year`); 115 tests. Motor 0.7.0.

## Calibración (anterior) — completada
**Anterior:** Fase 2b — Mapa real (completada)

## Calibración — entregado (ADR-0018)
- Población por hogares con pirámide de edades; niños en casa y estudiantes en la escuela; cronotipos de sueño y noche
  con horario español; reparto de cosechas por agricultores; mostradores por tamaño y cierre de colas. Motor 0.6.0.
- Behavior Gate 11/11 en mapa sintético y real (3 escenarios nuevos); 6 000 habitantes ≈ 185 ticks/s.

## Fase 2b — entregado (ADR-0017)
- `almensilla-3d` (sin commits; su Git lo gestiona el usuario): `build_logic.py`, `pack_map.py`, pasos `logic` y
  `pack` en `run_pipeline.py`, `tests/test_mappack.py`; `data/export/logic/` y `data/export/mappack/` ignorados (D7).
- WorldOpen: lector validador, resolvedores (Worker/CLI/servidor), `worldopen mappack install/list`, `--map-pack` en
  simulate, Behavior Gate y servidor, render del mapa real, elección de mapa al crear mundo, `npm run gate:real`.
- Modelo: trabajo y ocio cercanos (motor 0.5.0); Behavior Gate 8/8 en mapa sintético y real.

## Propuestas
- Publicar el map-pack como Release de `almensilla-3d` (decisión y acción del usuario: el repo es suyo).
- Despliegue del servidor (HTTPS, servicio, copias de `data/server/`).
- Ortofoto en el map-pack (pesa ~100 MB: valorar teselas de baja resolución).
- Siguiente modelo: varios pueblos simulados, otras fiestas del año (romería, Navidad), casas rurales, animales en las fichas de hogar y huerta, fauna salvaje, hermanos y nietos; LOD si se pasa de 6 000.

## Bloqueos / decisiones abiertas
- Nombre ficticio del pueblo: "Valdeolivo" (parámetro `--name` de `pack_map.py`).
- Exponer el servidor fuera del equipo exige HTTPS.
