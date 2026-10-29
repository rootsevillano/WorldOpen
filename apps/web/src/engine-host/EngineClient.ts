import {
  PROTOCOL_VERSION,
  type CommandEnvelope,
  type CriterionValue,
  type EngineQuery,
  type EngineToHost,
  type HostToEngine,
  type Issuer,
  type QueryResultMap,
  type WorldManifest,
} from '@worldopen/contracts';
import type { Transport } from './transport';

type Listener = (msg: EngineToHost) => void;

/** Lado UI del Simulation Protocol. El render y la UI solo hablan con el motor a través de esta clase. */
export class EngineClient {
  private readonly listeners = new Set<Listener>();
  private readonly pending = new Map<string, (result: unknown) => void>();
  private seq = 0;

  constructor(
    private readonly issuer: Issuer,
    private readonly transport: Transport,
  ) {
    transport.onMessage((msg) => {
      if (msg.type === 'queryResult') {
        this.pending.get(msg.requestId)?.(msg.result);
        this.pending.delete(msg.requestId);
      }
      for (const l of this.listeners) l(msg);
    });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private send(msg: HostToEngine): void {
    this.transport.send(msg);
  }

  init(manifest: WorldManifest): void {
    this.send({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
  }

  load(worldId: string): void {
    this.send({ type: 'load', protocol: PROTOCOL_VERSION, worldId });
  }

  replay(worldId: string): void {
    this.send({ type: 'replay', protocol: PROTOCOL_VERSION, worldId });
  }

  seek(tick: number): void {
    this.send({ type: 'seek', tick });
  }

  analyze(everyTicks: number, metrics: string[]): void {
    this.send({ type: 'analyze', everyTicks, metrics });
  }

  end(): void {
    this.send({ type: 'end' });
  }

  play(): void {
    this.send({ type: 'control', action: 'play' });
  }

  pause(): void {
    this.send({ type: 'control', action: 'pause' });
  }

  setSpeed(ticksPerSecond: number | 'max'): void {
    this.send({ type: 'control', action: 'setSpeed', ticksPerSecond });
  }

  step(ticks: number): void {
    this.send({ type: 'step', ticks });
  }

  command(type: string, version: number, payload: unknown): string {
    const envelope: CommandEnvelope = { id: `${this.issuer.userId}-${Date.now()}-${this.seq++}`, type, version, issuer: this.issuer, payload };
    this.send({ type: 'command', envelope });
    return envelope.id;
  }

  setCriterion(key: string, value: CriterionValue): string {
    return this.command('criteria.set', 1, { key, value });
  }

  query<K extends EngineQuery['kind']>(kind: K): Promise<QueryResultMap[K]> {
    const requestId = `q${this.seq++}`;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve as (r: unknown) => void);
      this.send({ type: 'query', requestId, query: { kind } as EngineQuery });
    });
  }

  /** Consulta con parámetros (inspector). */
  ask<Q extends EngineQuery>(query: Q): Promise<QueryResultMap[Q['kind']]> {
    const requestId = `q${this.seq++}`;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve as (r: unknown) => void);
      this.send({ type: 'query', requestId, query });
    });
  }

  dispose(): void {
    this.transport.close();
    this.listeners.clear();
  }
}
