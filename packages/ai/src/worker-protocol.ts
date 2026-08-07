import type { GameState } from '@damath/engine';
import { chooseMove } from './search.js';
import { tierOptions, type DifficultyTier } from './tiers.js';
import type { SearchOptions, SearchResult } from './types.js';

export interface AiWorkerRequest<V> {
  readonly id: string;
  readonly state: GameState<V>;
  readonly tier: DifficultyTier;
  readonly seed?: number;
  /**
   * Bypasses `tier`'s own preset entirely when set — the post-game review feature needs
   * a fixed, blunder-free budget distinct from any of the four *play* tiers (those are
   * tuned for opponent strength/UX, not analysis), and adding a fifth `DifficultyTier`
   * just to carry it would leak an analysis-only concept into `docs/AI_OPPONENT.md`'s
   * player-facing tier table. `tier` is still required on every request (existing
   * callers always pass one, and it's what a request "is" for logging/typing purposes)
   * — this just overrides what search options that tier would otherwise resolve to.
   */
  readonly options?: SearchOptions;
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
  const options = request.options ?? (request.seed === undefined ? tierOptions(request.tier) : tierOptions(request.tier, request.seed));
  const result = chooseMove(request.state, options);
  return { id: request.id, result };
}
