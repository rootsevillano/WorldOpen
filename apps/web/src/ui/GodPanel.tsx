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
          {editable.map((def) => (
            <CriterionField key={def.key} def={def} value={catalog.values[def.key]} onApply={(v) => client.setCriterion(def.key, v)} />
          ))}
          <p className="muted small">
            Comandos: {catalog.commands.map((c) => `${c.type} v${c.version}${c.status !== 'active' ? ` (${c.status})` : ''}`).join(', ')}
          </p>
        </>
      )}
    </section>
  );
}

function CriterionField({ def, value, onApply }: { def: CriterionDefinition; value: CriterionValue | undefined; onApply: (v: CriterionValue) => void }) {
  const [draft, setDraft] = useState<CriterionValue>(value ?? def.default);
  useEffect(() => setDraft(value ?? def.default), [value, def.default]);
  const dirty = draft !== value;

  let input;
  if (def.type === 'number') {
    const step = def.max !== undefined && def.min !== undefined && def.max - def.min <= 1 ? 0.05 : 1;
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
      <span>{def.key}</span>
      {input}
      <button type="button" disabled={!dirty} onClick={() => onApply(draft)}>
        Aplicar
      </button>
    </label>
  );
}
