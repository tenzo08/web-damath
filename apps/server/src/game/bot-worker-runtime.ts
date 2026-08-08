import { parentPort } from 'node:worker_threads';
import { handleAiRequest, type AiWorkerRequest } from '@damath/ai';

if (!parentPort) throw new Error('bot-worker-runtime.ts must run inside a worker_threads.Worker');

/**
 * Server-side mirror of `packages/ai/src/worker.ts` (the browser Web Worker adapter) --
 * same `handleAiRequest` core, same request/response shape, just wired to Node's
 * `worker_threads` instead of the DOM's `Worker`. Keeps the alpha-beta search
 * (`packages/ai/src/search.ts`) off the server's single event loop, so a bot "thinking"
 * for up to `tiers.ts`'s 3s tournament-tier budget no longer stalls every other
 * concurrently connected room (see `docs/AI_OPPONENT.md` §3/§9, `bot-pool.ts`).
 */
parentPort.on('message', (request: AiWorkerRequest<unknown>) => {
  void handleAiRequest(request).then((response) => parentPort?.postMessage(response));
});
