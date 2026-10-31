# ADR-0026 · Propietarios locales y compra de vivienda

**Estado:** Aceptada · 2026-10-31 · Fuente: E1 (D), ADR-0022, ADR-0024

## Decisión
1. **Casero:** columna `landlord` por agente (id de hogar; 0 = fondo de fuera). Al crear el mundo, el 60 % de los
   hogares de alquiler paga a un hogar propietario del pueblo con algún mayor de 45 (hash del hogar, sin PRNG). El
   alquiler entra en el dinero del hogar casero; si el casero deja el pueblo, el piso pasa a un fondo de fuera.
2. **Nuevos alquileres** (parejas, emancipación, inmigrantes): si un hogar propietario del pueblo puede pagar una
   vivienda entera, el más rico la compra (al Exterior) y es su casero (`home.investment`); si no, un fondo de fuera.
3. **Precio de la vivienda:** 20 años de alquiler base (≈ 43 000 con el alquiler a 0,6×), × `economy.priceLevel` ×
   índice de ocupación; no depende de `economy.rentLevel` (la política de alquileres).
4. **Compra con hipoteca:** un hogar de alquiler con la entrada (10 % / `economy.creditAccess`, nuevo, 0–2; 0 = al
   contado) más 60 días de alquiler de colchón compra su vivienda con probabilidad diaria 1/360 (hash hogar-día, sin
   PRNG). El casero cobra el precio entero (el banco pone el resto); el hogar debe el resto (`mortgage`) y paga cada
   día una cuota del 80 % del alquiler base hasta saldarla (`home.bought`, `mortgage.paidOff`).
5. **Impago:** la cuota impagada suma impagos como el alquiler; a los 30 días, ejecución hipotecaria: el hogar se va
   del pueblo (`household.evicted` con `cause: mortgage`).
6. **Gasto discrecional:** cada día se gasta fuera del pueblo el 0,5 % de lo que el hogar tenga por encima de 1 000
   por miembro de 14+. Sin él los ahorros crecían sin límite (de 2 700 a 10 500 por adulto en dos años) y casi todos
   los inquilinos compraban en meses.
7. Inspector: vivienda propia / con hipoteca (deuda) / de alquiler (a quién se paga); HUD: precio de la vivienda.
   Métricas `households.ownerRatio`, `households.mortgageRatio`, `households.localLandlordRatio`,
   `economy.housePrice`. Motor 0.14.0.

## Consecuencias
- Dos años, mapa sintético (400) y real (2 000): el alquiler baja despacio (28 → 22 % y 25 → 22 %), las hipotecas
  suben al 7–10 %, ≈ la mitad de los alquileres siguen con casero del pueblo; ahorros estables (≈ 2 000–3 000 por
  adulto); sin hambre ni desahucios.
- `lifecycle-year` exige hipotecas (≥ 1 %) y caseros locales (≥ 30 %) al cabo del año.
- Pendiente: venta entre particulares, herencia de viviendas, tipos de interés.
