import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/search.js';
import { dama, ordinary, stateWith } from './fixtures.js';
import { tierOptions } from '../src/tiers.js';

describe('the Damath-specific test (docs/AI_OPPONENT.md §8)', () => {
  it('`tournament` chooses the least-bad capture when the only options land on a losing "-" square', () => {
    // Rules note: because captures are mandatory whenever any exists, and only
    // maximal-length sequences are legal (§4.2-4.3), "decline the capture entirely"
    // is never actually a legal option once one exists — the engine itself forecloses
    // that, and it's covered by packages/engine's own move-generation tests. What the
    // *evaluation* is responsible for is the choice this leaves: among the tied
    // maximal captures, several land on a '-' square that reduces the taker's score
    // (a naive material-maximizing AI has no reason to prefer one over another, since
    // "captured a chip" looks identical either way) — tournament must pick the
    // available option that loses the least.
    const state = stateWith([
      [{ row: 0, col: 1 }, dama('white', 2)],
      [{ row: 2, col: 3 }, ordinary('black', 5)],
      [{ row: 0, col: 7 }, ordinary('white', 1)],
      [{ row: 7, col: 0 }, ordinary('black', 1)],
    ]);

    const result = chooseMove(state, tierOptions('tournament', 1));
    const landing = result.move.to;
    const chosePositiveOverNegative =
      (landing.row === 4 && landing.col === 5) || (landing.row === 5 && landing.col === 6);
    expect(chosePositiveOverNegative).toBe(true);
    expect(result.move.captures).toHaveLength(1);
  });
});
