/// <reference lib="webworker" />
import type { HostToEngine } from '@worldopen/contracts';
import { EngineHostCore } from './hostCore';

/** Host Web Worker: el motor corre aquí, fuera del hilo de render (master prompt §2). */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const PUMP_MS = 8;

const core = new EngineHostCore(
  (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  () => performance.now(),
);

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule(): void {
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    core.pump(performance.now());
    schedule();
  }, PUMP_MS);
}

scope.onmessage = (e: MessageEvent<HostToEngine>) => {
  core.handle(e.data);
  schedule();
};
