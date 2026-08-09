import { describe, expect, it } from 'vitest';
import { createGame, legalMoves, WHOLE_DAMATH } from '@damath/engine';
import type { Move, Piece } from '@damath/engine';
import type { SearchResult } from '@damath/ai';
import { classifyDelta, isSameMove, plyAccuracy, reviewPly } from './gameReview';

function fakePiece(overrides: Partial<Piece<number>> = {}): Piece<number> {
  return { id: 'p1', value: 3, owner: 'black', isDama: false, ...overrides };
}

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

describe('plyAccuracy', () => {
  it('is 100 for a zero delta (the played move was the engine\'s best)', () => {
    expect(plyAccuracy(0)).toBe(100);
  });

  it('decreases as delta grows, never increases', () => {
    const deltas = [0, 0.5, 1, 3, 6, 12, 20];
    const scores = deltas.map(plyAccuracy);
    for (let i = 1; i < scores.length; i++) {
      const prev = scores[i - 1];
      const next = scores[i];
      if (prev === undefined || next === undefined) throw new Error('unreachable: fixed-length array');
      expect(next).toBeLessThan(prev);
    }
  });

  it('stays within [0, 100] for a very large delta', () => {
    const score = plyAccuracy(1000);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('clamps a negative delta to 100, same as classifyDelta clamping it to "best"', () => {
    expect(plyAccuracy(-5)).toBe(100);
  });

  it('weighs a bigger point swing more heavily than counting classification tiers alone would', () => {
    // Two different "inaccuracy"-tier deltas (classifyDelta's own band is 3 < delta <= 6)
    // used to count identically toward accuracy; plyAccuracy must still tell them apart.
    expect(classifyDelta(3.5)).toBe('inaccuracy');
    expect(classifyDelta(5.5)).toBe('inaccuracy');
    expect(plyAccuracy(3.5)).toBeGreaterThan(plyAccuracy(5.5));
  });
});

describe('isSameMove', () => {
  const from = { row: 2, col: 1 };
  const to = { row: 4, col: 3 };

  it('treats two quiet moves with the same from/to as the same move', () => {
    const a: Move<number> = { from, to, captures: [] };
    const b: Move<number> = { from, to, captures: [] };
    expect(isSameMove(a, b)).toBe(true);
  });

  it('treats two capture sequences with the same from/to but different captured squares as different moves', () => {
    // The exact scenario the delta computation depends on getting right: a Dama's
    // multi-direction captures can share a start and end square while taking different
    // pieces along different paths (moves.ts's maximal-capture rule only constrains
    // sequence length, not which squares are captured) — from/to alone can't tell them
    // apart, but the review's "was this the best move" claim depends on it doing so.
    const a: Move<number> = {
      from,
      to,
      captures: [{ capturedPiece: fakePiece(), capturedAt: { row: 3, col: 2 }, landedAt: to }],
    };
    const b: Move<number> = {
      from,
      to,
      captures: [{ capturedPiece: fakePiece({ id: 'p2' }), capturedAt: { row: 3, col: 0 }, landedAt: to }],
    };
    expect(isSameMove(a, b)).toBe(false);
  });

  it('treats two moves with a different number of capture steps as different moves', () => {
    const oneCapture: Move<number> = { from, to, captures: [{ capturedPiece: fakePiece(), capturedAt: { row: 3, col: 2 }, landedAt: to }] };
    const quiet: Move<number> = { from, to, captures: [] };
    expect(isSameMove(oneCapture, quiet)).toBe(false);
  });

  it('treats identical capture sequences as the same move', () => {
    const a: Move<number> = { from, to, captures: [{ capturedPiece: fakePiece(), capturedAt: { row: 3, col: 2 }, landedAt: to }] };
    const b: Move<number> = { from, to, captures: [{ capturedPiece: fakePiece({ id: 'different-object' }), capturedAt: { row: 3, col: 2 }, landedAt: to }] };
    // Deliberately different `capturedPiece` object identity/id -- position is what
    // identifies the captured piece for this comparison, not the piece object itself.
    expect(isSameMove(a, b)).toBe(true);
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
