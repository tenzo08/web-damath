/// <reference lib="webworker" />
import { handleAiRequest, type AiWorkerRequest } from './worker-protocol.js';

/**
 * Runs unchanged in a browser Web Worker (Vite: `new Worker(new URL('./worker.ts',
 * import.meta.url), { type: 'module' })`) — practice mode never blocks the UI thread
 * and never leaves the browser, so it works offline (docs/AI_OPPONENT.md §3, §9
 * "Practice mode").
 */
self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  self.postMessage(handleAiRequest(event.data));
};
