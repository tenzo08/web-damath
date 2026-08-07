import { describe, expect, it } from 'vitest';
import { createGame, legalMoves, WHOLE_DAMATH } from '@damath/engine';
import type { Move } from '@damath/engine';
import type { SearchResult } from '@damath/ai';
import { classifyDelta, reviewPly } from './gameReview';

describe('classifyDelta', () => {
  it.each([
    [0, 'best'],
    [0.01, 'best'],
    [0.5, 'excellent'],
    [1, 'excellent'],
    [2, 'good'],
    [3, 'good'],
    [4, 'inaccuracy'],
    [6, 'inaccuracy'],
    [7, 'mistake'],
    [12, 'mistake'],
    [12.5, 'blunder'],
    [100, 'blunder'],
  ] as const)('classifies a delta of %s as %s', (delta, expected) => {
    expect(classifyDelta(delta)).toBe(expected);
  });

  it('clamps a negative delta to the "best" band rather than throwing or going out of range', () => {
    expect(classifyDelta(-5)).toBe('best');
  });
});

describe('reviewPly', () => {
  const state = createGame(WHOLE_DAMATH);
  const moves = legalMoves(state);
  const [moveA, moveB] = moves;
  if (!moveA || !moveB) throw new Error('unreachable: the opening position always has multiple legal moves');

  function stubSearch(bestMove: Move<number>, score: number) {
    return (): Promise<SearchResult<number>> => Promise.resolve({ move: bestMove, score, depth: 1, nodesEvaluated: 1, timeMs: 1 });
  }

  it('when the played move matches the engine\'s best move, marks it "best" with a zero delta', async () => {
    const review = await reviewPly(WHOLE_DAMATH, state, moveA, 1, stubSearch(moveA, 5));
    expect(review.isBest).toBe(true);
    expect(review.delta).toBe(0);
    expect(review.classification).toBe('best');
  });

  it('when the played move differs, computes a non-negative delta from the two searched scores', async () => {
    let call = 0;
    const search = (s: typeof state): Promise<SearchResult<number>> => {
      call += 1;
      // First call: searching the position before the move (the "best" reference).
      // Second call: searching the position after the played move, from the opponent's
      // perspective -- reviewPly negates this back to the mover's perspective.
      const firstMove = legalMoves(s)[0];
      if (!firstMove) throw new Error('unreachable: this test never reaches a terminal position');
      if (call === 1) return Promise.resolve({ move: moveA, score: 10, depth: 1, nodesEvaluated: 1, timeMs: 1 });
      return Promise.resolve({ move: firstMove, score: -4, depth: 1, nodesEvaluated: 1, timeMs: 1 });
    };
    const review = await reviewPly(WHOLE_DAMATH, state, moveB, 1, search);
    expect(review.isBest).toBe(false);
    // best (10) - actualForMover (-(-4) = 4) = 6
    expect(review.delta).toBeCloseTo(6);
    expect(review.classification).toBe('inaccuracy');
    expect(review.bestMove).toEqual(moveA);
    expect(review.playedMove).toEqual(moveB);
  });
});
