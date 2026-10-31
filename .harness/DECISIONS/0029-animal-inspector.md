# ADR-0029 · Inspector de animales

**Estado:** Aceptada · 2026-10-31 · Fuente: G1, ADR-0027

## Decisión
1. **Consulta nueva** `query { kind: 'animal', animalId }` → `AnimalDetail | null` (protocolo v6): tipo, edad, hogar
   dueño (adulto de más edad y su casa), huerta, quién lo pasea, estado (en casa, de paseo, esperando fuera de un
   local, recogido, fuera junto a la nave), minutos de paseo hoy y ayer, raciones que da y posición. Solo lectura.
2. **Selección en el render:** `Pick` admite `{ kind: 'animal', id }`; los animales visibles se pueden seleccionar (antes
   que los edificios) y llevan el marcador amarillo.
3. **Panel del inspector:** enlaces al dueño, su casa, la huerta y quien lo pasea; aviso de "se quedó sin pasear"
   si ayer no salió 20 minutos; "ya no está en el pueblo" si desaparece. Motor 0.17.0.

## Consecuencias
- Los animales recogidos (perros en casa, ganado de noche) no se dibujan y no se pueden seleccionar en la vista: se
  llega a ellos por la consulta. Pendiente: lista de animales de un hogar o de una huerta en sus inspectores.
