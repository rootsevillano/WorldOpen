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

type Listener = (msg: EngineToHost) => void;

/** Lado UI del Simulation Protocol. El render y la UI solo hablan con el motor a través de esta clase. */
export class EngineClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<Listener>();
  private readonly pending = new Map<string, (result: unknown) => void>();
  private seq = 0;

  constructor(private readonly issuer: Issuer) {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<EngineToHost>) => {
      const msg = e.data;
      if (msg.type === 'queryResult') {
        this.pending.get(msg.requestId)?.(msg.result);
        this.pending.delete(msg.requestId);
      }
      for (const l of this.listeners) l(msg);
    };
    this.worker.onerror = (e) => {
      for (const l of this.listeners) l({ type: 'error', message: e.message });
    };
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private send(msg: HostToEngine): void {
    this.worker.postMessage(msg);
  }

  init(manifest: WorldManifest): void {
    this.send({ type: 'init', protocol: PROTOCOL_VERSION, manifest });
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

  dispose(): void {
    this.worker.terminate();
    this.listeners.clear();
  }
}
