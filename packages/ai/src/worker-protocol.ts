import type { GameState } from '@damath/engine';
import { chooseMove } from './search.js';
import { tierOptions, type DifficultyTier } from './tiers.js';
import type { SearchResult } from './types.js';

export interface AiWorkerRequest {
  readonly id: string;
  readonly state: GameState<number>;
  readonly tier: DifficultyTier;
  readonly seed?: number;
}

export interface AiWorkerResponse {
  readonly id: string;
  readonly result: SearchResult;
}

/**
 * The worker's actual logic, kept separate from `self.postMessage`/`onmessage` wiring
 * so it's plain-function testable in Node without a real Worker or DOM. `worker.ts` is
 * the thin adapter Vite bundles as the real worker entry point.
 */
export function handleAiRequest(request: AiWorkerRequest): AiWorkerResponse {
  const options = request.seed === undefined ? tierOptions(request.tier) : tierOptions(request.tier, request.seed);
  const result = chooseMove(request.state, options);
  return { id: request.id, result };
}
