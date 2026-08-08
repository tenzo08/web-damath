import type { DifficultyTier } from '@damath/ai';
import type { GameState, Move } from '@damath/engine';
import { botWorkerPool } from './bot-pool.js';

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
 * Runs the search in a Node `worker_thread` (`bot-pool.ts`), not the main thread —
 * docs/AI_OPPONENT.md §3/§9's "off the main event loop... must not block the event loop
 * across rooms" requirement. Previously ran `chooseMove` synchronously here, which meant
 * one bot "thinking" for up to `tiers.ts`'s 3s tournament-tier budget froze the entire
 * WebSocket message loop for every other concurrently connected room, human-vs-human
 * included (KNOWLEDGE.md).
 */
export function computeBotMove<V>(state: GameState<V>, tier: DifficultyTier, seed?: number): Promise<Move<V>> {
  return botWorkerPool.compute(state, tier, seed);
}
