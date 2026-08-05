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
