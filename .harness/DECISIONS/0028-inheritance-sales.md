# ADR-0028 · Herencia y compraventa de viviendas entre particulares

**Estado:** Aceptada · 2026-10-31 · Fuente: S5, ADR-0019, ADR-0026

## Decisión
1. **Parentesco entre hogares:** al crear el mundo, cada hogar con algún mayor de 60 tiene uno o dos hijos adultos en
   otros hogares (20–40 años más jóvenes que el progenitor más joven de 50+), unidos por la relación de familia a la
   generación de los padres. Por hash, sin PRNG. Antes solo era familia quien convivía: casi todas las herencias iban
   al Estado.
2. **Viviendas de sobra:** columna `spare` (todo el hogar igual): viviendas que tiene además de la suya.
3. **Herencia** (al morir, antes de borrar sus relaciones): si quedan adultos en el hogar, el dinero pasa a quien
   comparte la casa y la vivienda sigue siendo del hogar. Si era el último adulto, el heredero (familiar o pareja de
   otro hogar, el de más afinidad) recibe el dinero, la vivienda si estaba pagada (con hipoteca, se la queda el
   banco), las viviendas de sobra y los inquilinos (`inheritance`). Sin herederos, todo pasa al Estado y los inquilinos
   a un fondo de fuera (`estate.toState`).
4. **Alquilar antes que comprar:** un hogar nuevo de alquiler se queda con la vivienda vacía de un hogar del pueblo (el
   que más tenga, `home.let`) antes de que un inversor compre otra (ADR-0026).
5. **Venta entre particulares:** quien tiene viviendas de sobra vende una si su dinero baja del 5 % del precio o, por
   gusto, con probabilidad diaria 1/360 (hash). Compra el hogar propietario más rico que pueda pagarla; si ninguno, el
   Exterior (`home.sold`).
6. Inspector: viviendas de más e inquilinos del hogar. Métrica `households.spareHomes`. Motor 0.16.0.

## Consecuencias
- Dos años con mortalidad ×2: mapa real (2 000), 32 herencias y 1 al Estado, 19 viviendas heredadas alquiladas y 3
  ventas; mapa sintético (400), 8 herencias. Las viviendas de sobra apenas se acumulan: se alquilan pronto.
- `lifecycle-year` exige al menos una herencia. El test de ADR-0020 "la familia es solo la del hogar" pasa a
  "la familia de fuera es de padres e hijos" (15–70 años de diferencia).
- Pendiente: hermanos y nietos, testamentos, reparto entre varios herederos, plusvalías.
