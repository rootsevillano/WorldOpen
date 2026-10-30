import type { EconomySummary, EngineStatus, Season, WorldManifest } from '@worldopen/contracts';
import type { PopulationSummary } from './useEngine';

const SEASONS: Record<Season, string> = { winter: 'Invierno', spring: 'Primavera', summer: 'Verano', autumn: 'Otoño' };
const pad = (n: number) => String(n).padStart(2, '0');

export function Hud({ manifest, status, population, economy }: { manifest: WorldManifest | null; status: EngineStatus | null; population: PopulationSummary | null; economy: EconomySummary | null }) {
  const region = manifest?.regions[0]?.displayName ?? '…';
  const d = status?.date;
  return (
    <section className="panel hud" aria-label="Estado del mundo">
      <h1>{region}</h1>
      {manifest && <div className="muted small">{manifest.name}</div>}
      {d ? (
        <>
          <div className="clock" data-testid="clock">
            {pad(d.hour)}:{pad(d.minute)}
          </div>
          <div className="muted">
            Día {d.day}/{d.month} · Año {d.year} · {SEASONS[d.season]}
          </div>
          {population && (
            <div className="small" data-testid="population">
              {population.total} habitantes · {population.walking} en la calle · {population.working} trabajando · {population.sleeping} durmiendo
              {population.queueing > 0 && ` · ${population.queueing} en cola`}
            </div>
          )}
          {economy && (
            <div className="small muted" data-testid="economy">
              Tiendas {economy.shopFood.toFixed(0)} comida · Fuentes {economy.fountainWater.toFixed(0)} agua · Aserradero {economy.sawmillWood.toFixed(0)} leña
              <br />
              Despensas: {economy.pantryFood.toFixed(0)} comida · {economy.pantryWater.toFixed(0)} agua · {economy.pantryWood.toFixed(0)} leña
              <br />
              Comida {economy.foodPrice.toFixed(2)} · Leña {economy.woodPrice.toFixed(2)} · Paro {(economy.unemploymentRate * 100).toFixed(0)} % · Salarios {economy.wageIndex.toFixed(2)}× · Alquiler {economy.rent.toFixed(1)}/día · Ahorros {economy.householdMoney.toFixed(0)} · Cajas {economy.businessCash.toFixed(0)}
            </div>
          )}
          <div className="muted small">
            Tick <span data-testid="tick">{status.tick}</span> · {status.measuredTps} ticks/s
          </div>
        </>
      ) : (
        <div className="muted">Arrancando el motor…</div>
      )}
    </section>
  );
}
