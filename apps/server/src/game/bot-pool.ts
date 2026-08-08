import { Worker } from 'node:worker_threads';
import type { AiWorkerRequest, AiWorkerResponse, DifficultyTier } from '@damath/ai';
import type { GameState, Move } from '@damath/engine';

const WORKER_ENTRY = new URL('./bot-worker.mjs', import.meta.url);

/**
 * How many bot searches can run concurrently, off the main event loop. Small and fixed
 * -- search is CPU-bound and Render's free tier has few real cores, so more workers than
 * cores just adds context-switch overhead, not throughput. Override via env for a bigger
 * deployment.
 */
const POOL_SIZE = Number(process.env.BOT_WORKER_POOL_SIZE ?? 2);

interface PendingRequest<V> {
  readonly resolve: (move: Move<V>) => void;
  readonly reject: (error: Error) => void;
}

/** One live worker thread plus the requests currently in flight against it. */
class PoolWorker {
  readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest<unknown>>();

  constructor(onExit: (self: PoolWorker) => void) {
    this.worker = new Worker(WORKER_ENTRY);
    this.worker.on('message', (response: AiWorkerResponse<unknown>) => {
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      pending.resolve(response.result.move);
    });
    // A worker that throws (a bundling issue, a genuine bug in `packages/ai`) would
    // otherwise leave every in-flight request against it unresolved forever -- a bot
    // room stuck mid-turn with no way for a player to know why.
    this.worker.on('error', (error: Error) => this.failAll(error));
    this.worker.on('exit', (code) => {
      this.failAll(new Error(`bot worker exited unexpectedly (code ${String(code)})`));
      onExit(this);
    });
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  send<V>(id: string, request: AiWorkerRequest<V>, pending: PendingRequest<V>): void {
    this.pending.set(id, pending as PendingRequest<unknown>);
    this.worker.postMessage(request);
  }
}

/**
 * A fixed pool of Node `worker_threads`, each running the same alpha-beta search
 * (`packages/ai/src/search.ts`) the browser's practice-mode Web Worker uses. Moves bot
 * move computation off the server's single event loop -- previously, one bot "thinking"
 * for up to `tiers.ts`'s 3s tournament-tier time budget stalled every other concurrently
 * connected room, human-vs-human included, since Node has only one thread for the whole
 * WebSocket message loop. Closes the gap `docs/AI_OPPONENT.md` §3/§9 and `bot.ts`'s own
 * former doc comment flagged as a known, deliberately-deferred limitation.
 */
class BotWorkerPool {
  private readonly workers: PoolWorker[];
  private nextIndex = 0;
  private requestSeq = 0;

  constructor(size: number) {
    this.workers = Array.from({ length: size }, () => this.spawn());
  }

  private spawn(): PoolWorker {
    const worker: PoolWorker = new PoolWorker((dead) => {
      const index = this.workers.indexOf(dead);
      if (index !== -1) this.workers[index] = this.spawn();
    });
    return worker;
  }

  compute<V>(state: GameState<V>, tier: DifficultyTier, seed?: number): Promise<Move<V>> {
    const worker = this.workers[this.nextIndex];
    if (!worker) throw new Error('bot worker pool has no workers');
    this.nextIndex = (this.nextIndex + 1) % this.workers.length;
    const id = `bot-${String(this.requestSeq++)}`;
    const request: AiWorkerRequest<V> = seed === undefined ? { id, state, tier } : { id, state, tier, seed };
    return new Promise<Move<V>>((resolve, reject) => {
      worker.send(id, request, { resolve, reject });
    });
  }
}

export const botWorkerPool = new BotWorkerPool(POOL_SIZE);
