import { animalSystem } from '../agents/animals';
import { transitSystem } from '../agents/transit';
import { disasterSystem } from '../agents/disasters';
import { festivalSystem, fiestaCriteria, processionSystem } from '../agents/festival';
import { economySystem, serviceSystem } from '../agents/economy';
import { lifecycleSystem } from '../agents/lifecycle';
import { moneySystem } from '../agents/money';
import { householdsSystem } from '../agents/households';
import { socialSystem } from '../agents/social';
import { decisionSystem, movementSystem, needsSystem } from '../agents/systems';
import { agentRemoveV1, agentSpawnV1 } from '../commands/agents';
import { disasterFireV1 } from '../commands/disasters';
import type { Ruleset } from './ruleset';

/** Ruleset del MVP (época contemporánea; `world.era` prepara la histórica). */
export const contemporary: Ruleset = {
  id: 'contemporary',
  criteria: [
    {
      key: 'climate.baseTemperatureC',
      type: 'number', min: -10, max: 50, default: 18,
      description: 'Temperatura media de referencia (°C); el día oscila ±6 °C. Dios puede fijarla (ola de calor).',
      mutableBy: 'both',
    },
    {
      key: 'economy.foodAbundance',
      type: 'number', min: 0, max: 1, default: 0.7,
      description: 'Abundancia de comida: escala cosechas e importaciones diarias (0 = escasez, 1 = sobra).',
      mutableBy: 'admin',
    },
    {
      key: 'economy.waterSupply',
      type: 'number', min: 0, max: 1, default: 1,
      description: 'Caudal del agua corriente de las casas (0 = corte: hay que ir a las fuentes públicas).',
      mutableBy: 'admin',
    },
    {
      key: 'society.sociability',
      type: 'number', min: 0, max: 1, default: 0.5,
      description: 'Tendencia general de la población a relacionarse.',
      mutableBy: 'admin',
    },
    {
      key: 'society.festivalMonth',
      label: 'Primer pueblo · fiestas: mes',
      type: 'number', min: 1, max: 12, default: 8, integer: true,
      description: 'Mes de las fiestas del pueblo (1–12).',
      mutableBy: 'admin',
    },
    {
      key: 'society.festivalStartDay',
      label: 'Primer pueblo · fiestas: día',
      type: 'number', min: 1, max: 30, default: 15, integer: true,
      description: 'Día del mes en que empiezan las fiestas (meses de 30 días).',
      mutableBy: 'admin',
    },
    {
      key: 'society.festivalLength',
      label: 'Primer pueblo · fiestas: días',
      type: 'number', min: 1, max: 10, default: 4, integer: true,
      description: 'Duración de las fiestas en días.',
      mutableBy: 'admin',
    },
    {
      key: 'society.festivalHoliday',
      label: 'Primer pueblo · fiestas: festivo',
      type: 'number', min: 0, max: 10, default: 2, integer: true,
      description: 'Día de fiestas que es festivo (sin trabajo ni escuela); 0 = ninguno.',
      mutableBy: 'admin',
    },
    {
      key: 'society.festivities',
      type: 'number', min: 0, max: 3, default: 1,
      description: 'Fiestas del pueblo (15–18 de agosto, el 16 festivo): intensidad de la verbena y de los visitantes; 0 = sin fiestas.',
      mutableBy: 'admin',
    },
    {
      key: 'society.fertility',
      type: 'number', min: 0, max: 5, default: 1,
      description: 'Multiplicador de la natalidad (1 = tasas aproximadas de España; 0 = sin nacimientos).',
      mutableBy: 'admin',
    },
    {
      key: 'society.mortality',
      type: 'number', min: 0, max: 5, default: 1,
      description: 'Multiplicador de la mortalidad por edad (1 = tasas aproximadas de España). El hambre mata aparte.',
      mutableBy: 'admin',
    },
    {
      key: 'society.immigration',
      type: 'number', min: 0, max: 5, default: 1,
      description: 'Multiplicador de la llegada de hogares nuevos a viviendas libres (1 ≈ 2 % de la población al año).',
      mutableBy: 'admin',
    },
    {
      key: 'economy.creditAccess',
      type: 'number', min: 0, max: 2, default: 1,
      description: 'Acceso al crédito hipotecario: 1 = entrada del 10 %; 0,5 = del 20 %; 0 = sin hipotecas (se compra al contado).',
      mutableBy: 'admin',
    },
    {
      key: 'economy.livestock',
      type: 'number', min: 0, max: 3, default: 1,
      description: 'Ganado de las huertas: 1 = una gallina por cada 20 m² y una oveja por cada 100 m² de nave; 0 = ninguno.',
      mutableBy: 'admin',
    },
    {
      key: 'economy.priceLevel',
      type: 'number', min: 0.25, max: 4, default: 1,
      description: 'Nivel de precios: venta al público, mayorista, exportación y gastos fijos de los hogares (1 = normal).',
      mutableBy: 'admin',
    },
    {
      key: 'economy.rentLevel',
      type: 'number', min: 0, max: 10, default: 1,
      description: 'Nivel de los alquileres (1 ≈ 300 al mes con el 90 % de viviendas ocupadas; 0 = sin alquileres).',
      mutableBy: 'admin',
    },
    {
      key: 'economy.wageLevel',
      type: 'number', min: 0.25, max: 4, default: 1,
      description: 'Nivel de salarios (1 = 9 por hora trabajada).',
      mutableBy: 'admin',
    },
    {
      key: 'economy.welfare',
      type: 'number', min: 0, max: 3, default: 1,
      description: 'Multiplicador de pensiones, prestación por desempleo y ayuda por hijo (0 = sin estado del bienestar).',
      mutableBy: 'admin',
    },
    {
      key: 'society.carOwnership',
      type: 'number', min: 0, max: 1, default: 0.75,
      description: 'Proporción de hogares con coche (≈ 0,75 en España; en la época histórica no hay coches).',
      mutableBy: 'admin',
    },
    {
      key: 'society.petOwnership',
      type: 'number', min: 0, max: 1, default: 0.3,
      description: 'Proporción de hogares con perro (≈ 0,3 en España). Los perros piden paseo y comida.',
      mutableBy: 'admin',
    },
    {
      key: 'society.tourism',
      type: 'number', min: 0, max: 3, default: 1,
      description: 'Turismo: multiplica los visitantes (×2 en verano, ×0,5 en invierno) y cuántos se alojan en el hostal.',
      mutableBy: 'admin',
    },
    {
      key: 'society.transit',
      type: 'number', min: 0, max: 3, default: 1,
      description: 'Autobús a los pueblos vecinos: 1 = uno cada hora de 07:00 a 21:00; 2 = cada media hora; 0 = sin servicio.',
      mutableBy: 'admin',
    },
    {
      key: 'society.commuting',
      type: 'number', min: 0, max: 1, default: 0.5,
      description: 'Trabajo en otros pueblos: parte de los parados que trabaja fuera al crear el mundo (y ritmo al que lo encuentran).',
      mutableBy: 'admin',
    },
    {
      key: 'society.emigration',
      type: 'number', min: 0, max: 5, default: 1,
      description: 'Multiplicador de la marcha de jóvenes solteros (más si no hay vivienda libre).',
      mutableBy: 'admin',
    },
    {
      key: 'society.townMigration',
      type: 'number', min: 0, max: 10, default: 1,
      description: 'Mudanzas entre pueblos del mundo: parte de quienes se irían se quedan en otro pueblo, y los hogares que trabajan fuera se mudan allí; 0 = ninguna.',
      mutableBy: 'admin',
    },
    {
      key: 'society.initialPopulation',
      type: 'number', min: 0, max: 10000, default: 5,
      description: 'Habitantes al crear el mundo. Después, la población cambia con comandos.',
      mutableBy: 'system',
    },
    {
      key: 'world.era',
      type: 'enum', options: ['contemporary', 'historical'], default: 'contemporary',
      description: 'Época del mundo: condiciona tecnología, oficios y costumbres disponibles.',
      mutableBy: 'admin',
    },
  ],
  commands: [agentSpawnV1, agentRemoveV1, disasterFireV1],
  systems: [
    { name: 'festival', run: festivalSystem },
    { name: 'disasters', run: disasterSystem },
    { name: 'economy', run: economySystem },
    { name: 'needs', run: needsSystem },
    { name: 'decision', run: decisionSystem },
    { name: 'movement', run: movementSystem },
    { name: 'procession', run: processionSystem },
    { name: 'transit', run: transitSystem },
    { name: 'service', run: serviceSystem },
    { name: 'social', run: socialSystem },
    { name: 'animals', run: animalSystem },
    { name: 'lifecycle', run: lifecycleSystem },
    { name: 'households', run: householdsSystem },
    { name: 'money', run: moneySystem },
  ],
  regionCriteria: fiestaCriteria,
};

export const RULESETS: Record<string, Ruleset> = { [contemporary.id]: contemporary };
