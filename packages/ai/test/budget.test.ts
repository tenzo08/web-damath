import { describe, expect, it } from 'vitest';
import { createGame, WHOLE_DAMATH } from '@damath/engine';
import { chooseMove } from '../src/search.js';

describe('time budget compliance (docs/AI_OPPONENT.md §8)', () => {
  it('never exceeds timeBudgetMs by more than 10%, across all four tiers', () => {
    const state = createGame(WHOLE_DAMATH);
    const budgets = [300, 800, 1500, 3000];
    for (const timeBudgetMs of budgets) {
      const result = chooseMove(state, { maxDepth: 8, timeBudgetMs, seed: 7 });
      expect(result.timeMs).toBeLessThanOrEqual(timeBudgetMs * 1.1);
    }
  });
});
