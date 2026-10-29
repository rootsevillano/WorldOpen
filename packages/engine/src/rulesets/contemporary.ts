import type { Ruleset } from './ruleset';

/** Ruleset del MVP. En la Fase 1 solo declara criterios; los sistemas llegan con la Fase 2. */
export const contemporary: Ruleset = {
  id: 'contemporary',
  criteria: [
    {
      key: 'climate.baseTemperatureC',
      type: 'number', min: -10, max: 50, default: 18,
      description: 'Temperatura media de referencia (°C). El clima la varía solo; Dios puede fijarla.',
      mutableBy: 'both',
    },
    {
      key: 'economy.foodAbundance',
      type: 'number', min: 0, max: 1, default: 0.7,
      description: 'Abundancia de comida en el mundo (0 = escasez, 1 = sobra).',
      mutableBy: 'admin',
    },
    {
      key: 'society.sociability',
      type: 'number', min: 0, max: 1, default: 0.5,
      description: 'Tendencia general de la población a relacionarse.',
      mutableBy: 'admin',
    },
    {
      key: 'world.era',
      type: 'enum', options: ['contemporary', 'historical'], default: 'contemporary',
      description: 'Época del mundo: condiciona tecnología, oficios y costumbres disponibles.',
      mutableBy: 'admin',
    },
  ],
  commands: [],
  systems: [],
};

export const RULESETS: Record<string, Ruleset> = { [contemporary.id]: contemporary };
