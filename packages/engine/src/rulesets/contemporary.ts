import { disasterSystem } from '../agents/disasters';
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
      key: 'economy.priceLevel',
      type: 'number', min: 0.25, max: 4, default: 1,
      description: 'Nivel de precios: venta al público, mayorista, exportación y gastos fijos de los hogares (1 = normal).',
      mutableBy: 'admin',
    },
    {
      key: 'economy.rentLevel',
      type: 'number', min: 0, max: 4, default: 1,
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
      key: 'society.emigration',
      type: 'number', min: 0, max: 5, default: 1,
      description: 'Multiplicador de la marcha de jóvenes solteros (más si no hay vivienda libre).',
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
    { name: 'disasters', run: disasterSystem },
    { name: 'economy', run: economySystem },
    { name: 'needs', run: needsSystem },
    { name: 'decision', run: decisionSystem },
    { name: 'movement', run: movementSystem },
    { name: 'service', run: serviceSystem },
    { name: 'social', run: socialSystem },
    { name: 'lifecycle', run: lifecycleSystem },
    { name: 'households', run: householdsSystem },
    { name: 'money', run: moneySystem },
  ],
};

export const RULESETS: Record<string, Ruleset> = { [contemporary.id]: contemporary };
