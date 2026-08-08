import type { SearchOptions } from './types.js';

export type DifficultyTier = 'learner' | 'steady' | 'sharp' | 'tournament';

/** docs/AI_OPPONENT.md §7. Difficulty is depth and deliberate imperfection, never cheating — every tier sees exactly what `legalMoves()` returns. */
export const TIERS: Readonly<Record<DifficultyTier, Omit<SearchOptions, 'seed'>>> = {
  learner: { maxDepth: 2, timeBudgetMs: 300, blunderRate: 0.25 },
  steady: { maxDepth: 4, timeBudgetMs: 800, blunderRate: 0.08 },
  sharp: { maxDepth: 6, timeBudgetMs: 1500, blunderRate: 0.02 },
  tournament: { maxDepth: 8, timeBudgetMs: 3000, blunderRate: 0 },
};

export function tierOptions(tier: DifficultyTier, seed?: number): SearchOptions {
  const preset = TIERS[tier];
  return seed === undefined ? { ...preset } : { ...preset, seed };
}

/**
 * How much each tier trusts the trained NNUE evaluator (`evaluate.ts`'s
 * `NnueBlend.blendWeight`), on top of the hand-tuned heuristic every tier already
 * uses — a second axis of difficulty besides search depth: a stronger tier also leans
 * more on trained pattern-recognition, not just calculating further ahead. `learner`
 * is deliberately `0`, not an oversight — a beginner-facing opponent should play
 * recognizably simple, depth-limited heuristic Damath, not occasionally surprise a new
 * player with a subtle NNUE-flavoured choice it can't yet explain to itself either.
 * Verified per-variant (`test/nnue-tier-ordering.test.ts`): every tier, blended at
 * these weights, still loses to the tier above it on aggregate score margin.
 */
export const NNUE_BLEND_WEIGHTS: Readonly<Record<DifficultyTier, number>> = {
  learner: 0,
  steady: 0.15,
  sharp: 0.3,
  tournament: 0.45,
};
