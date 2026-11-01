# CURRENT PHASE

**Fase actual:** Varios pueblos · ✅ **completada** (2026-11-01) · ⏸️ revisión del usuario (O3)

## Varios pueblos — entregado (ADR-0036)
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
