import { BuildingState, type AgentDetail, type BuildingDetail } from '@worldopen/contracts';
import type { Pick, WorldRenderer } from '@worldopen/render';
import { useEffect, useState } from 'react';
import type { EngineClient } from '../engine-host/EngineClient';

const NEEDS_ES: Record<string, string> = {
  energy: 'Energía', shelter: 'Cobijo', social: 'Social', hunger: 'Hambre', thirst: 'Sed', work: 'Trabajo',
};
const ACTIONS_ES: Record<string, string> = {
  stay: 'quedarse', goHome: 'volver a casa', goOut: 'salir', seekShelter: 'buscar cobijo', sleep: 'dormir',
  provision: 'abastecerse', work: 'trabajar / estudiar', deliver: 'llevar la cosecha',
};
const OCCUPATIONS_ES: Record<string, string> = {
  unemployed: 'en paro', retired: 'jubilado/a', shopkeeper: 'comercio', farmer: 'campo', sawyer: 'aserradero',
  civilServant: 'servicio público', student: 'estudiante', child: 'niño/a en casa',
};
const MEMORY_ES: Record<string, string> = {
  foodEmpty: 'tienda sin comida', waterEmpty: 'fuente seca', woodEmpty: 'aserradero sin leña', fire: 'vio un incendio',
  newFriend: 'hizo un amigo', lostHome: 'perdió su casa en un incendio', grief: 'perdió a un ser querido',
  newChild: 'nació un hijo en casa', partner: 'empezó una relación', moved: 'se mudó de casa', broke: 'no pudo pagar',
};
const TENURE_ES: Record<string, string> = { owner: 'vivienda propia', mortgaged: 'vivienda con hipoteca', renter: 'de alquiler' };
const RELATIONS_ES: Record<string, string> = { family: 'familia', acquaintance: 'conocido', friend: 'amistad', partner: 'pareja' };
const USES_ES: Record<string, string> = {
  residential: 'Vivienda', agriculture: 'Huerta', industrial: 'Aserradero', office: 'Oficina', retail: 'Tienda',
  publicServices: 'Servicio público (fuente)', unknown: 'Desconocido',
};
const STATES_ES = ['En uso', '🔥 Ardiendo', 'Dañado'];

/** Inspector del Modo Dios (G1): consulta el motor cada medio segundo mientras hay selección. */
export function Inspector(props: {
  client: EngineClient;
  renderer: WorldRenderer;
  selection: Pick;
  isAdmin: boolean;
  readOnly: boolean;
  onSelect: (p: Pick) => void;
}) {
  const { client, renderer, selection, onSelect } = props;
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [building, setBuilding] = useState<BuildingDetail | null>(null);
  const [following, setFollowing] = useState<number | null>(renderer.followingId);

  useEffect(() => {
    setAgent(null);
    setBuilding(null);
    if (!selection) return;
    let alive = true;
    const poll = () => {
      if (selection.kind === 'agent') void client.ask({ kind: 'agent', agentId: selection.id }).then((d) => alive && setAgent(d));
      else void client.ask({ kind: 'building', buildingId: selection.id }).then((d) => alive && setBuilding(d));
    };
    poll();
    const timer = setInterval(poll, 500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client, selection]);

  if (!selection) return null;
  const close = () => {
    renderer.follow(null);
    setFollowing(null);
    onSelect(null);
  };

  return (
    <section className="panel inspector" aria-label="Inspector">
      <header>
        <h2>{selection.kind === 'agent' ? (agent?.name ?? 'Habitante') : (building ? USES_ES[building.use] : 'Edificio')}</h2>
        <button type="button" className="link" onClick={close}>Cerrar</button>
      </header>

      {selection.kind === 'agent' && agent && (
        <>
          <div className="muted small">
            {agent.age} años · {OCCUPATIONS_ES[agent.occupation]} · vive en{' '}
            <button type="button" className="link inline" onClick={() => onSelect({ kind: 'building', id: agent.home })}>{agent.home}</button>
          </div>
          <div className="small">
            Ahora: <strong>{ACTIONS_ES[agent.action]}</strong> {agent.location ? `en ${agent.location}` : 'por la calle'}
            {agent.carrying && ` · lleva ${agent.carrying.amount.toFixed(0)} de ${agent.carrying.resource}`}
          </div>
          <div className="small muted">
            Dinero: {agent.money.toFixed(2)} · {TENURE_ES[agent.housing.tenure]}
            {agent.housing.tenure === 'renter' && ` (paga a ${agent.housing.landlord ?? 'un fondo de fuera'})`}
            {agent.housing.mortgage > 0 && ` (le quedan ${agent.housing.mortgage.toFixed(0)})`}
            {agent.housing.arrears > 0 && ` · ${agent.housing.arrears} días sin pagar el alquiler`}
            {agent.car.household && (agent.car.driving ? ' · lleva el coche' : ' · hay coche en casa')}
          </div>
          <div className="bars">
            {Object.entries(agent.needs).map(([k, v]) => (
              <Bar key={k} label={NEEDS_ES[k] ?? k} value={v} />
            ))}
            <Bar label="Salud" value={agent.health} />
          </div>
          <details>
            <summary className="small">Por qué decidió así (puntuaciones)</summary>
            <ul className="small plain">
              {Object.entries(agent.lastScores)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k}>{ACTIONS_ES[k] ?? k}: {v.toFixed(2)}</li>
                ))}
            </ul>
          </details>
          <details>
            <summary className="small">Relaciones ({agent.relations.length})</summary>
            <ul className="small plain">
              {agent.relations.map((r) => (
                <li key={r.agentId}>
                  <button type="button" className="link inline" onClick={() => onSelect({ kind: 'agent', id: r.agentId })}>{r.name}</button>{' '}
                  · {RELATIONS_ES[r.kind]} ({r.affinity.toFixed(2)})
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary className="small">Recuerdos ({agent.memory.length})</summary>
            <ul className="small plain">
              {agent.memory.map((m, k) => (
                <li key={k}>[{m.tick}] {MEMORY_ES[m.kind] ?? m.kind}{m.building ? ` · ${m.building}` : ''}</li>
              ))}
            </ul>
          </details>
          <div className="god-actions">
            <button
              type="button"
              className={following === agent.id ? 'active' : ''}
              onClick={() => {
                const next = following === agent.id ? null : agent.id;
                renderer.follow(next);
                setFollowing(next);
              }}
            >
              {following === agent.id ? 'Dejar de seguir' : '🎥 Seguir'}
            </button>
          </div>
        </>
      )}

      {selection.kind === 'building' && building && (
        <>
          <div className="small">{building.id} · {STATES_ES[building.state]} · {building.floors} planta(s)</div>
          <div className="small">
            Comida {building.stock.food.toFixed(0)} · Agua {building.stock.water.toFixed(0)} · Leña {building.stock.wood.toFixed(1)}
          </div>
          <div className="small muted">
            {building.residents} residentes · {building.occupants} dentro · {building.workers} trabajando · {building.queue} en cola
          </div>
          {building.business && (
            <div className="small muted">
              Caja {building.business.cash.toFixed(0)} · plantilla {building.business.staff}/{building.business.positions} puestos
              {building.business.price !== null && ` · vende a ${building.business.price.toFixed(2)}`} · jornal {building.business.wage.toFixed(0)}
            </div>
          )}
          {props.isAdmin && !props.readOnly && building.state === BuildingState.Normal && (
            <div className="god-actions">
              <button type="button" className="danger" onClick={() => client.command('disaster.fire', 1, { buildingId: building.id })}>
                🔥 Provocar incendio
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const tone = value < 0.25 ? 'bad' : value < 0.5 ? 'warn' : 'good';
  return (
    <div className="bar" title={`${label}: ${pct} %`}>
      <span>{label}</span>
      <div className="track">
        <div className={`fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
