import type { GameState } from '@damath/engine';
import { chooseMove } from './search.js';
import { tierOptions, type DifficultyTier } from './tiers.js';
import type { SearchResult } from './types.js';

export interface AiWorkerRequest<V> {
  readonly id: string;
  readonly state: GameState<V>;
  readonly tier: DifficultyTier;
  readonly seed?: number;
}

export interface AiWorkerResponse<V> {
  readonly id: string;
  readonly result: SearchResult<V>;
}

/**
 * The worker's actual logic, kept separate from `self.postMessage`/`onmessage` wiring
 * so it's plain-function testable in Node without a real Worker or DOM. `worker.ts` is
 * the thin adapter Vite bundles as the real worker entry point.
 */
export function handleAiRequest<V>(request: AiWorkerRequest<V>): AiWorkerResponse<V> {
  const options = request.seed === undefined ? tierOptions(request.tier) : tierOptions(request.tier, request.seed);
  const result = chooseMove(request.state, options);
  return { id: request.id, result };
}
