import { describe, expect, it } from 'vitest';
import { applyMove, finalScores, isGameOver } from '../src/game.js';
import { legalMoves } from '../src/moves.js';
import type { GameState, Move, Piece, Player, Position } from '../src/types.js';
import type { Arithmetic } from '../src/arithmetic.js';
import { FRACTION_DAMATH, fraction, fractionArithmetic } from '../src/data/fraction.js';
import { RADICAL_DAMATH, radical, radicalArithmetic } from '../src/data/radical.js';
import { POLYNOMIAL_DAMATH, polynomial, polynomialArithmetic } from '../src/data/polynomial.js';

/** Generic version of the other test files' `stateWith` helper — proves the engine core, not just each Arithmetic<V>. */
function stateWith<V>(
  arithmetic: Arithmetic<V>,
  placements: readonly [Position, Piece<V>][],
  turn: Player = 'white',
): GameState<V> {
  const board: (Piece<V> | null)[][] = Array.from({ length: 8 }, () => new Array(8).fill(null));
  for (const [pos, piece] of placements) {
    board[pos.row]![pos.col] = piece;
  }
  return {
    board,
    turn,
    scores: { white: arithmetic.zero, black: arithmetic.zero },
    moveHistory: [],
    status: 'active',
    variant: 'integer',
  };
}

function only<V>(moves: readonly Move<V>[]): Move<V> {
  if (moves.length !== 1) throw new Error(`Expected exactly one legal move, got ${String(moves.length)}`);
  return moves[0]!;
}

describe('Fraction Damath plays through the real engine', () => {
  it('captures exactly (no truncation) and finalScores adds remaining chips', () => {
    const taker: Piece<typeof FRACTION_DAMATH.values[number]> = { id: 'w', value: fraction(1, 2), owner: 'white', isDama: false };
    const taken: Piece<typeof FRACTION_DAMATH.values[number]> = { id: 'b', value: fraction(1, 3), owner: 'black', isDama: false };
    // (2,3) -> capture (3,4) land (4,5), op '/': (1/2) / (1/3) = 3/2, exact — no truncation.
    const state = stateWith(fractionArithmetic, [
      [{ row: 2, col: 3 }, taker],
      [{ row: 3, col: 4 }, taken],
    ]);
    const move = only(legalMoves(state));
    const next = applyMove(state, move, FRACTION_DAMATH);
    expect(next.scores.white).toEqual(fraction(3, 2));

    const totals = finalScores(next, fractionArithmetic);
    // score (3/2) plus the remaining piece's own unchanged value (1/2) — piece values
    // never change through the game, only the running score accumulates.
    expect(totals.white).toEqual(fraction(2, 1));
  });
});

describe('Radical Damath plays through the real engine', () => {
  it('a Dama capture doubles the score via arithmetic.double', () => {
    const takerDama: Piece<typeof RADICAL_DAMATH.values[number]> = {
      id: 'w',
      value: radical(fraction(3), 2), // 3√2
      owner: 'white',
      isDama: true,
    };
    const taken: Piece<typeof RADICAL_DAMATH.values[number]> = {
      id: 'b',
      value: radical(fraction(1), 2), // √2
      owner: 'black',
      isDama: false,
    };
    // Dama at (0,1) jumps the enemy at (2,3); landing squares beyond are (3,4)/(4,5)/
    // (5,6)/(6,7) (§6.4) — pick the (3,4) landing (op '-') for a deterministic result:
    // (3√2) - (√2) = 2√2, doubled for the Dama-takes-ordinary capture (§5.3) = 4√2.
    const state = stateWith(radicalArithmetic, [
      [{ row: 0, col: 1 }, takerDama],
      [{ row: 2, col: 3 }, taken],
    ]);
    const moves = legalMoves(state);
    const move = moves.find((m) => m.to.row === 3 && m.to.col === 4);
    if (!move) throw new Error('expected a legal capture landing on (3,4)');
    const next = applyMove(state, move, RADICAL_DAMATH);
    expect(radicalArithmetic.format(next.scores.white)).toBe('4√2');
  });
});

describe('Polynomial Damath plays through the real engine', () => {
  it('captures via a landing operation and isGameOver/finalScores work with polynomial totals', () => {
    const taker: Piece<typeof POLYNOMIAL_DAMATH.values[number]> = {
      id: 'w',
      value: polynomial(fraction(6), 1, 0), // 6x
      owner: 'white',
      isDama: false,
    };
    const taken: Piece<typeof POLYNOMIAL_DAMATH.values[number]> = {
      id: 'b',
      value: polynomial(fraction(2), 0, 1), // 2y
      owner: 'black',
      isDama: false,
    };
    // (3,4) jumps the enemy at (4,5), landing at (5,6) -- op '/'. Per the coordinate-
    // substitution house rule (scoring.ts's `scoreCaptureAt`, not a rulebook rule),
    // both operands are evaluated at the landing square first: x=6 (col), y=5 (row) ->
    // taker 6x -> 6*6=36, taken 2y -> 2*5=10, then 36 / 10 = 18/5.
    const state = stateWith(polynomialArithmetic, [
      [{ row: 3, col: 4 }, taker],
      [{ row: 4, col: 5 }, taken],
    ]);
    const move = only(legalMoves(state));
    const next = applyMove(state, move, POLYNOMIAL_DAMATH);
    expect(next.scores.white).toEqual(polynomial(fraction(18, 5)));
    // Black had only the one (now-captured) piece — cornered by having no chips left (§7.3).
    expect(isGameOver(next, POLYNOMIAL_DAMATH)).toBe(true);

    const totals = finalScores(next, polynomialArithmetic);
    // white's score (18/5) plus the remaining piece's own printed value (6x, still
    // symbolic on the board) evaluated at *its* current square (5,6): 6*6=36. 18/5 + 36
    // = 18/5 + 180/5 = 198/5.
    expect(totals.white).toEqual(polynomial(fraction(198, 5)));
  });
});
