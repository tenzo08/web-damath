import type { GameState } from '@damath/engine';
import { chooseMove } from './search.js';
import { NNUE_BLEND_WEIGHTS, tierOptions, type DifficultyTier } from './tiers.js';
import type { SearchOptions, SearchResult } from './types.js';
import { loadNnueWeights } from './nnueEval.js';
import type { NnueBlend } from './evaluate.js';

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
 *
 * Async only because of the one-time NNUE weight load (`nnueEval.ts`'s
 * `loadNnueWeights`, cached after the first call per variant) — `chooseMove` and the
 * whole search tree underneath it stay fully synchronous (see KNOWLEDGE.md's "Per-
 * variant NNUE evaluator" entry for why that split exists). Each tier trusts the
 * trained evaluator by a different amount (`tiers.ts`'s `NNUE_BLEND_WEIGHTS`) — 0 for
 * `learner` skips the load entirely, so a beginner-tier request never pays for it.
 */
export async function handleAiRequest<V>(request: AiWorkerRequest<V>): Promise<AiWorkerResponse<V>> {
  const options = request.options ?? (request.seed === undefined ? tierOptions(request.tier) : tierOptions(request.tier, request.seed));
  const blendWeight = NNUE_BLEND_WEIGHTS[request.tier];
  let nnue: NnueBlend | undefined;
  if (blendWeight > 0) {
    const weights = await loadNnueWeights(request.state.variant);
    if (weights) nnue = { weights, blendWeight };
  }
  const result = chooseMove(request.state, options, undefined, undefined, nnue);
  return { id: request.id, result };
}
