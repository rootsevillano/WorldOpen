# ADR-0039 · Vender para mudarse de pueblo

**Estado:** Aceptada · 2026-11-01 · Amplía ADR-0026, ADR-0028 y ADR-0038 · Fuente: decisión del usuario

## Decisión
1. **Los propietarios también se mudan al pueblo donde trabajan** (ADR-0038), con el 40 % de la probabilidad de un
   hogar de alquiler: tienen más arraigo.
2. **Venta** (`sellHome`): al precio de mercado (`housePrice`). La compra el hogar propietario sin hipoteca más rico
   que pueda pagarla, que la tendrá de sobra para alquilar (ADR-0028); si no hay ninguno, el Exterior. Con lo cobrado
   se salda la hipoteca. Si la venta no cubre la deuda y el hogar no puede poner la diferencia, no se muda.
3. **Compra en el destino** (`buyHome`): a un hogar con viviendas de sobra (el que más tenga) o al Exterior. Al
   contado si le llega con un colchón de 60 días de alquiler; si no, con hipoteca si tiene para la entrada
   (`downPaymentShare`) y el colchón; si tampoco, alquila.
4. Las viviendas de sobra y los inquilinos del hogar siguen siendo suyos tras la mudanza, aunque el hogar cambie de
   id (corrige ADR-0038, que los perdía).
5. Evento `household.relocated` con `reason: 'work-owner'`, además de `home.sold` y `home.bought`. Motor 0.27.0; el
   protocolo no cambia.

## Consecuencias
- Con `townMigration` 10 y 800 habitantes en 3 pueblos: 2–5 hogares propietarios se mudan en 60 días. Venden al
  Exterior y vuelven a comprar al contado con lo cobrado.
- Nadie del pueblo compra: ningún hogar tiene ahorros para pagar una vivienda entera.
- Un mundo de un solo pueblo no cambia. 19/19 en ambos mapas; 174 tests.
- Pendiente: precios de la vivienda por pueblo y buscar trabajo en otro pueblo.
