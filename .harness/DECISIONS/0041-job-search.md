# ADR-0041 · Buscar trabajo (también en otros pueblos)

**Estado:** Aceptada · 2026-11-02 · Amplía ADR-0022 y ADR-0036 · Fuente: decisión del usuario

## Decisión
1. **Acción `SeekJob`** (utilidad 0,7). La consideran los adultos de 18 a 66 años en paro, en horario laboral
   (laborables de 08:00 a 15:00), una vez al día (`AgentStore.searchedDay`) y solo si hay algún puesto libre en el
   mundo. Las decisiones del agente siguen sin LLM (ADR-0008).
2. **Puesto libre:** un negocio con plaza (`positionsOf`) y caja para cuatro semanas de nóminas con una persona más.
   Es la misma regla que la contratación de los lunes (ADR-0022). Se calcula una vez por tick (`openings`).
3. **Destino:** el negocio con puesto libre más cercano de su pueblo y, si en su pueblo no hay ninguno, el más
   cercano de otro pueblo. Va andando o en coche por la carretera comarcal.
4. **Al llegar** (`hireAt`): si la plaza sigue libre, le contratan en el acto. Se emite `job.hired` con
   `search: 'ownTown' | 'otherTown'` y el agente recuerda `NewJob`. La contratación semanal de los lunes no cambia.
5. **Métricas:** `agents.seekingJob` y `jobs.open`. En la web, el inspector muestra «buscar trabajo» y «encontró
   trabajo», y el registro indica «(lo buscó en otro pueblo)». Motor 0.29.0: nueva columna en el snapshot y nueva
   acción. El protocolo no cambia.

## Consecuencias
- 3 pueblos sintéticos y 800 habitantes, 30 días: 7 contrataciones buscando en otro pueblo y 4 en el propio; el
  paro acaba en 0.
- En el mapa real, el lunes los inversores reabren negocios y contratan a todo el paro: entre semana casi nunca
  queda nadie buscando. El escenario `job-search` hace llegar 200 vecinos un martes para que haya quien busque.
- Se cambia el orden de los sorteos del agente: los escenarios de un solo pueblo cambian ligeramente sus valores.
  Siguen 20/20 en ambos mapas; 176 tests.
- Pendiente: salarios distintos por pueblo y que el coste del desplazamiento influya en qué trabajo se acepta.
