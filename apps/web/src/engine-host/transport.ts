import type { EngineToHost, HostToEngine } from '@worldopen/contracts';
import { decode, encode } from '@worldopen/host';

/** Canal entre la UI y un host del motor: Worker local o servidor por WebSocket (mismo protocolo, ADR-0002). */
export interface Transport {
  send(msg: HostToEngine): void;
  onMessage(cb: (msg: EngineToHost) => void): void;
  close(): void;
}

/** Motor en un Web Worker del navegador (modo local). */
export class WorkerTransport implements Transport {
  private readonly worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });

  send(msg: HostToEngine): void {
    this.worker.postMessage(msg);
  }

  onMessage(cb: (msg: EngineToHost) => void): void {
    this.worker.onmessage = (e: MessageEvent<EngineToHost>) => cb(e.data);
    this.worker.onerror = (e) => cb({ type: 'error', message: e.message });
  }

  close(): void {
    this.worker.terminate();
  }
}

/**
 * Motor en el servidor (ADR-0016). Encola lo enviado hasta que el socket abre y, si `reconnect`, se reconecta con
 * espera creciente (el servidor reenvía `ready`, `status` y el último `frame` a quien llega).
 */
export class SocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private cb: (msg: EngineToHost) => void = () => {};
  private closed = false;
  private delay = 500;

  constructor(private readonly path: '/ws/live' | '/ws/study', private readonly reconnect: boolean) {
    this.open();
  }

  private open(): void {
    const url = new URL(this.path, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.delay = 500;
      for (const m of this.queue) ws.send(m);
      this.queue = [];
    };
    ws.onmessage = (e: MessageEvent<string>) => this.cb(decode<EngineToHost>(e.data));
    ws.onclose = (e) => {
      if (this.closed) return;
      if (e.code === 4401) {
        this.cb({ type: 'error', message: 'La sesión ha caducado: vuelve a entrar.' });
        return;
      }
      this.cb({ type: 'error', message: 'Conexión con el servidor perdida; reintentando…' });
      if (this.reconnect) {
        setTimeout(() => !this.closed && this.open(), this.delay);
        this.delay = Math.min(this.delay * 2, 10_000);
      }
    };
  }

  send(msg: HostToEngine): void {
    const text = encode(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(text);
    else this.queue.push(text);
  }

  onMessage(cb: (msg: EngineToHost) => void): void {
    this.cb = cb;
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
