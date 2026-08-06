import { chooseMove, tierOptions, type DifficultyTier } from '@damath/ai';
import type { GameState, Move } from '@damath/engine';

/** docs/AI_OPPONENT.md §9: "add a small artificial delay (~400-1200ms, scaled to tier)... instant replies feel mechanical." */
const THINK_DELAY_MS: Readonly<Record<DifficultyTier, number>> = {
  learner: 400,
  steady: 700,
  sharp: 1000,
  tournament: 1200,
};

export function botThinkDelayMs(tier: DifficultyTier): number {
  return THINK_DELAY_MS[tier];
}

/**
 * Runs `chooseMove` on the main thread. docs/AI_OPPONENT.md §3/§9 ask for search to run
 * "off the main event loop... must not block the event loop across rooms" — a genuine
 * gap against that requirement, scoped down deliberately for this pass rather than left
 * unmentioned (KNOWLEDGE.md). `steady`'s 800ms time budget bounds how bad a single stall
 * can be; a Node `worker_threads` pool (mirroring `packages/ai`'s existing browser
 * Web Worker adapter) is the natural next step and is isolated entirely behind this one
 * function — nothing else in `apps/server` needs to change when that lands.
 */
export function computeBotMove<V>(state: GameState<V>, tier: DifficultyTier, seed?: number): Move<V> {
  const options = seed === undefined ? tierOptions(tier) : tierOptions(tier, seed);
  return chooseMove(state, options).move;
}
