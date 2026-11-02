import type { CatalogResult, CriterionDefinition, CriterionValue } from '@worldopen/contracts';
import { useEffect, useState } from 'react';
import type { EngineClient } from '../engine-host/EngineClient';

/**
 * Herramienta de criterios de Dios (V1, ADR-0010). Se genera a partir del catálogo del motor: un criterio o
 * comando nuevo aparece aquí sin tocar la UI.
 */
export function GodPanel({ client, catalog }: { client: EngineClient; catalog: CatalogResult }) {
  const [open, setOpen] = useState(true);
  const editable = catalog.criteria.filter((c) => c.mutableBy !== 'system');
  // Fechas de fiestas (ADR-0035, ADR-0047): las del primer pueblo y las de cada pueblo, aparte.
  const isDate = (c: CriterionDefinition) => c.key.startsWith('fiestas.') || (c.key.startsWith('society.festival') && c.key !== 'society.festivities');
  const field = (def: CriterionDefinition, label?: string) => (
    <CriterionField key={def.key} def={def} label={label} value={catalog.values[def.key]} onApply={(v) => client.setCriterion(def.key, v)} />
  );

  return (
    <section className="panel god" aria-label="Modo Dios">
      <header>
        <h2>Modo Dios · Criterios</h2>
        <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Ocultar' : 'Mostrar'}
        </button>
      </header>
      {open && (
        <>
          {editable.filter((c) => !isDate(c)).map((def) => field(def))}
          <details>
            <summary>Fechas de fiestas por pueblo</summary>
            {dateGroups(editable.filter(isDate)).map((g) => (
              <div key={g.town} className="criteria-group">
                <h3>{g.name}</h3>
                {g.defs.map((def) => field(def, def.label?.split(' · ')[1]))}
              </div>
            ))}
          </details>
          <div className="god-actions">
            {catalog.commands.some((c) => c.type === 'agent.spawn' && c.status !== 'removed') && (
              <button type="button" onClick={() => client.command('agent.spawn', 1, { count: 1 })}>
                + Crear habitante
              </button>
            )}
          </div>
          <p className="muted small">
            Comandos: {catalog.commands.map((c) => `${c.type} v${c.version}${c.status !== 'active' ? ` (${c.status})` : ''}`).join(', ')}
          </p>
        </>
      )}
    </section>
  );
}

/** Orden de lectura de las fechas de un pueblo: fiestas (mes, día, días, festivo), romería y carnaval (mes, día). */
const DATE_ORDER: Record<string, number> = {
  festivalMonth: 0, festivalStartDay: 1, festivalLength: 2, festivalHoliday: 3,
  patronalMonth: 0, patronalDay: 1, patronalLength: 2, patronalHoliday: 3, romeriaMonth: 4, romeriaDay: 5, carnavalMonth: 6, carnavalDay: 7,
};

/**
 * Fechas agrupadas por pueblo, en el orden de las regiones. Las patronales del primer pueblo (`society.festival…`)
 * van con su romería (`fiestas.r1.…`), y el grupo toma el nombre del pueblo de las etiquetas por región.
 */
function dateGroups(defs: CriterionDefinition[]): { town: string; name: string; defs: CriterionDefinition[] }[] {
  const towns = new Map<string, { town: string; name: string; defs: CriterionDefinition[] }>();
  for (const def of defs) {
    const perTown = def.key.startsWith('fiestas.');
    const town = perTown ? def.key.split('.')[1]! : 'r1';
    const g = towns.get(town) ?? { town, name: '', defs: [] };
    if (perTown || !g.name) g.name = def.label?.split(' · ')[0] ?? town;
    g.defs.push(def);
    towns.set(town, g);
  }
  const field = (d: CriterionDefinition) => DATE_ORDER[d.key.split('.').pop()!] ?? 9;
  return [...towns.values()]
    .sort((a, b) => a.town.localeCompare(b.town, undefined, { numeric: true }))
    .map((g) => ({ ...g, defs: g.defs.sort((a, b) => field(a) - field(b)) }));
}

function CriterionField({ def, label, value, onApply }: { def: CriterionDefinition; label?: string | undefined; value: CriterionValue | undefined; onApply: (v: CriterionValue) => void }) {
  const [draft, setDraft] = useState<CriterionValue>(value ?? def.default);
  useEffect(() => setDraft(value ?? def.default), [value, def.default]);
  const dirty = draft !== value;

  let input;
  if (def.type === 'number') {
    const step = def.integer ? 1 : def.max !== undefined && def.min !== undefined && def.max - def.min <= 1 ? 0.05 : 1;
    input = (
      <input type="number" min={def.min} max={def.max} step={step} value={Number(draft)} onChange={(e) => setDraft(e.target.valueAsNumber)} />
    );
  } else if (def.type === 'boolean') {
    input = <input type="checkbox" checked={Boolean(draft)} onChange={(e) => setDraft(e.target.checked)} />;
  } else {
    input = (
      <select value={String(draft)} onChange={(e) => setDraft(e.target.value)}>
        {(def.options ?? []).map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  }

  return (
    <label className="criterion" title={def.description}>
      <span>{label ?? def.label ?? def.key}</span>
      {input}
      <button type="button" disabled={!dirty} onClick={() => onApply(draft)}>
        Aplicar
      </button>
    </label>
  );
}
