# ADR-0042 · Salarios por pueblo

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0024, ADR-0040 y ADR-0041 · Fuente: decisión del usuario

## Decisión
1. **Salario inicial según el tamaño del pueblo** (`seedWages`, al crear el mundo). Cada negocio empieza con un
   índice salarial (`BuildingStore.wage`) de 0,8× a 1×, según las viviendas de su pueblo frente a las del mayor
   (`townSizeShares`, que también usa el recargo de alquiler de ADR-0040). Después, cada negocio sube o baja su
   salario según su caja y el paro, como siempre (ADR-0024). Con un solo pueblo, todos empiezan en 1 como antes.
2. **Elegir trabajo por jornal neto** (sustituye la regla de «primero en su pueblo» de ADR-0041). Quien busca trabajo
   va al puesto libre con más jornal neto: el jornal menos lo que cuesta ir y volver desde casa (2 por km en línea
   recta, por tiempo y gasto). A igual jornal, el más cercano, que suele ser el de su pueblo.
3. **Métricas** `town.<región>.wage` (jornal medio de quien trabaja en sus negocios) y `town.<región>.wageIndex`
   (índice salarial medio, que no depende de la mezcla de oficios). `EconomySummary.towns` añade `wage` (protocolo
   v15), y la línea de pueblos del HUD muestra el alquiler y el jornal de cada uno. Motor 0.30.0.

## Consecuencias
- Valdeolivo con 2 vecinos: índice salarial de 1,00, 0,97 y 0,97 al empezar. El jornal medio queda en 69 / 67 / 67,
  porque pesa más la mezcla de oficios (agricultor 60, tendero 80). En 30 días el mercado iguala los índices: los
  pueblos pequeños, sin paro, suben sueldos para atraer gente.
- Vivir en un pueblo pequeño (alquiler más bajo) y trabajar en el grande (jornal más alto) empieza a compensar.
- 20/20 en ambos mapas; 177 tests.
- Pendiente: que un empleado cambie a un trabajo mejor pagado en otro pueblo por su cuenta (ahora solo lo ficha el
  negocio, los lunes).
