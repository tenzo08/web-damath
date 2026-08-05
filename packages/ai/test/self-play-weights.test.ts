import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/search.js';
import { DEFAULT_WEIGHTS, MATERIAL_HEAVY_WEIGHTS } from '../src/evaluate.js';
import { dama, ordinary, stateWith } from './fixtures.js';

describe('F1 — score must dominate material (docs/AI_OPPONENT.md, "Fix these")', () => {
  it('score-dominant weights take the small piece for a good score; material-heavy weights grab the big piece for a score of zero', () => {
    // Two independent, tied-maximal single captures available to the same Dama:
    //  - capturing the black-10 lands on '/': trunc(3/10 * 2) = 0 — huge material, no score.
    //  - capturing the black-1  lands on '+': (3+1) * 2 = 8      — tiny material, real score.
    // §8.3: the win condition is score, not material on the board. A material-heavy
    // evaluation (reference/'s F1 bug: material weighted at 1.0 against score's 0.5)
    // has every reason to prefer the first and none to prefer the second.
    const state = stateWith([
      [{ row: 4, col: 3 }, dama('white', 3)],
      [{ row: 3, col: 2 }, ordinary('black', 10)],
      [{ row: 3, col: 4 }, ordinary('black', 1)],
      [{ row: 0, col: 7 }, ordinary('white', 1)],
      [{ row: 7, col: 0 }, ordinary('black', 2)],
    ]);

    for (let seed = 0; seed < 6; seed++) {
      const opts = { maxDepth: 6, timeBudgetMs: 200, seed };
      const scoreDominant = chooseMove(state, opts, undefined, DEFAULT_WEIGHTS);
      const materialHeavy = chooseMove(state, opts, undefined, MATERIAL_HEAVY_WEIGHTS);

      expect(scoreDominant.move.to).toEqual({ row: 2, col: 5 }); // takes the black-1, scores 8
      expect(materialHeavy.move.to).toEqual({ row: 2, col: 1 }); // takes the black-10, scores 0
    }
  });
});
