import { describe, expect, it } from 'vitest';
import { createGame } from '@damath/engine';
import { chooseMove } from '../src/search.js';

describe('determinism (docs/AI_OPPONENT.md §2, §8)', () => {
  it('same position + same seed produces the same move, 100 times', () => {
    const state = createGame('integer');
    const opts = { maxDepth: 4, timeBudgetMs: 200, seed: 12345, blunderRate: 0.1 };
    const clock = () => 0; // no time pressure — isolates seed determinism from timing jitter

    const first = chooseMove(state, opts, clock);
    for (let i = 0; i < 100; i++) {
      const result = chooseMove(state, opts, clock);
      expect(result.move).toEqual(first.move);
      expect(result.score).toBe(first.score);
      expect(result.depth).toBe(first.depth);
      expect(result.nodesEvaluated).toBe(first.nodesEvaluated);
    }
  });

  it('different seeds can produce different moves (blunder path actually varies)', () => {
    const state = createGame('integer');
    const clock = () => 0;
    const moves = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const result = chooseMove(state, { maxDepth: 3, timeBudgetMs: 200, seed, blunderRate: 0.5 }, clock);
      moves.add(JSON.stringify(result.move));
    }
    expect(moves.size).toBeGreaterThan(1);
  });
});
