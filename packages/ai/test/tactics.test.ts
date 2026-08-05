import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/search.js';
import { dama, ordinary, stateWith } from './fixtures.js';

describe('tactics suite (docs/AI_OPPONENT.md §8)', () => {
  it('picks the higher-scoring of two available landing squares for the same capture (§5.1, §6.4)', () => {
    // Dama at (0,1) captures ordinary at (2,3) — four possible landings, two score
    // (2-5)*2=-6 ('-' squares (3,4)/(6,7)), two score trunc(2/5)*2=0 ('/' squares
    // (4,5)/(5,6)). 0 beats -6; a naive "just take the capture" AI has no reason to
    // prefer one landing over another, but the score differs by 6 either way.
    const state = stateWith([
      [{ row: 0, col: 1 }, dama('white', 2)],
      [{ row: 2, col: 3 }, ordinary('black', 5)],
      [{ row: 0, col: 7 }, ordinary('white', 1)],
      [{ row: 7, col: 0 }, ordinary('black', 1)],
    ]);

    for (const maxDepth of [6, 8]) {
      const result = chooseMove(state, { maxDepth, timeBudgetMs: 1500, seed: 1 });
      const landing = result.move.to;
      const isGoodLanding = (landing.row === 4 && landing.col === 5) || (landing.row === 5 && landing.col === 6);
      const isBadLanding = (landing.row === 3 && landing.col === 4) || (landing.row === 6 && landing.col === 7);
      expect(isGoodLanding).toBe(true);
      expect(isBadLanding).toBe(false);
    }
  });

  it('prefers advancing a piece toward promotion over an equivalent non-promoting move', () => {
    const state = stateWith([
      [{ row: 6, col: 1 }, ordinary('white', 8)], // one step from promoting
      [{ row: 2, col: 1 }, ordinary('white', 1)], // a distant, low-value piece with a quiet move too
      [{ row: 5, col: 4 }, ordinary('black', 3)],
    ]);

    const result = chooseMove(state, { maxDepth: 6, timeBudgetMs: 1000, seed: 1 });
    expect(result.move.from).toEqual({ row: 6, col: 1 });
    expect(result.move.to.row).toBe(7);
  });
});
