import type { EngineStatus, Season, WorldManifest } from '@worldopen/contracts';
import type { PopulationSummary } from './useEngine';

const SEASONS: Record<Season, string> = { winter: 'Invierno', spring: 'Primavera', summer: 'Verano', autumn: 'Otoño' };
const pad = (n: number) => String(n).padStart(2, '0');

export function Hud({ manifest, status, population }: { manifest: WorldManifest | null; status: EngineStatus | null; population: PopulationSummary | null }) {
  const region = manifest?.regions[0]?.displayName ?? '…';
  const d = status?.date;
  return (
    <section className="panel hud" aria-label="Estado del mundo">
      <h1>{region}</h1>
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
              {population.total} habitantes · {population.indoors} bajo techo · {population.walking} en la calle · {population.sleeping} durmiendo
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
