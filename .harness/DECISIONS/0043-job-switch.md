# ADR-0043 · Cambiar a un trabajo mejor por iniciativa propia

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0024, ADR-0041 y ADR-0042 · Fuente: decisión del usuario

## Decisión
1. **Quién y cuándo:** quien trabaja en un negocio mira, una vez por semana, los puestos libres del mundo. Lo hace
   los laborables al salir del trabajo (15:00–19:00), y queda anotado en `searchedDay`. Los funcionarios, los
   estudiantes y quienes trabajan fuera del mundo no cambian así.
2. **Cuándo se cambia:** si el mejor puesto libre, por jornal neto (ADR-0042, sin contar el suyo), le deja al menos
   un 10 % más que el actual (`SWITCH_PREMIUM`, el mismo margen que los fichajes de los lunes), va a pedirlo
   (`SeekJob`). Puede ser en su pueblo o en otro.
3. **Al llegar** (`hireAt`): si la plaza sigue libre, se cambia. Deja su plaza libre y se emite `job.changed` con
   `from`, `building` y `search: 'ownTown' | 'otherTown'`.
4. Los fichajes de los lunes, en los que el negocio sube su salario y ficha a gente de otros (ADR-0024), siguen igual.
   Motor 0.31.0; el protocolo no cambia.

## Consecuencias
- En 30 días con 3 pueblos se cambian por su cuenta 28 personas (25 en su pueblo, 3 a otro) en el mapa sintético, y
  77 en el real.
- Como el jornal neto descuenta el desplazamiento, mucha gente acaba trabajando más cerca de casa. La parte que
  trabaja en otro pueblo baja del 14 % al 12 % en el sintético y del 10 % al 7 % en el real.
- 20/20 en ambos mapas (`job-search` lo comprueba); 178 tests.
- Pendiente: que el cambio tenga en cuenta algo más que el jornal (antigüedad, gusto por el oficio).
