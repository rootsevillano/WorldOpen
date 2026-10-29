import type { EngineStatus } from '@worldopen/contracts';
import type { EngineClient } from '../engine-host/EngineClient';

/** T2: velocidades predefinidas; el host acepta cualquier valor de ticks/s. */
const SPEEDS: { label: string; value: number | 'max' }[] = [
  { label: '1×', value: 1 },
  { label: '5×', value: 5 },
  { label: '20×', value: 20 },
  { label: '60×', value: 60 },
  { label: 'Máx', value: 'max' },
];

export function TimeControls({ client, status }: { client: EngineClient; status: EngineStatus }) {
  return (
    <section className="panel time-controls" aria-label="Control del tiempo">
      <button
        type="button"
        className={status.running ? '' : 'active'}
        onClick={() => (status.running ? client.pause() : client.play())}
      >
        {status.running ? '❚❚ Pausa' : '▶ Seguir'}
      </button>
      {SPEEDS.map((s) => (
        <button
          key={s.label}
          type="button"
          className={status.ticksPerSecond === s.value ? 'active' : ''}
          onClick={() => {
            client.setSpeed(s.value);
            if (!status.running) client.play();
          }}
        >
          {s.label}
        </button>
      ))}
    </section>
  );
}
