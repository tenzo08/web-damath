import { describe, expect, it } from 'vitest';
import { scoreCapture, scoreCaptureAt, substituteValueAt } from '../src/scoring.js';
import { numberArithmetic } from '../src/arithmetic.js';
import { fraction } from '../src/data/fraction.js';
import { polynomial, polynomialArithmetic } from '../src/data/polynomial.js';
import type { Polynomial } from '../src/data/polynomial.js';
import type { Piece, Player, Position } from '../src/types.js';

function ordinary(owner: Player, value: number): Piece<number> {
  return { id: `${owner}-test`, value, owner, isDama: false };
}

function dama(owner: Player, value: number): Piece<number> {
  return { id: `${owner}-dama-test`, value, owner, isDama: true };
}

describe('multiplier table (§5.3)', () => {
  it('ordinary takes ordinary: x1', () => {
    expect(scoreCapture(ordinary('white', 3), ordinary('black', 5), '+', numberArithmetic)).toBe(8);
  });

  it('dama takes ordinary: x2', () => {
    expect(scoreCapture(dama('white', 3), ordinary('black', 5), '+', numberArithmetic)).toBe(16);
  });

  it('ordinary takes dama: x2', () => {
    expect(scoreCapture(ordinary('white', 3), dama('black', 5), '+', numberArithmetic)).toBe(16);
  });

  it('dama takes dama: x4', () => {
    expect(scoreCapture(dama('white', 3), dama('black', 5), '+', numberArithmetic)).toBe(32);
  });
});

describe('division by zero (§5.5)', () => {
  it('contributes 0 regardless of the taker value or multiplier', () => {
    expect(scoreCapture(ordinary('white', 7), ordinary('black', 0), '/', numberArithmetic)).toBe(0);
    expect(scoreCapture(dama('white', 7), dama('black', 0), '/', numberArithmetic)).toBe(0);
  });
});

describe('negative score via subtraction (§5.2)', () => {
  it('reduces the taker total when the taken value is larger', () => {
    expect(scoreCapture(ordinary('white', 2), ordinary('black', 5), '-', numberArithmetic)).toBe(-3);
  });
});

describe('division truncation (KNOWLEDGE.md, "Division truncation")', () => {
  it('a magnitude under 1 counts as 0', () => {
    expect(scoreCapture(ordinary('white', 2), ordinary('black', 5), '/', numberArithmetic)).toBe(0);
  });

  it('otherwise truncates toward zero', () => {
    expect(scoreCapture(ordinary('white', -7), ordinary('black', 2), '/', numberArithmetic)).toBe(-3);
  });
});

function polyPiece(owner: Player, value: Polynomial, isDama = false): Piece<Polynomial> {
  return { id: `${owner}-poly-test`, value, owner, isDama };
}

// (2,5) is a real '+' square (OPERATION_LAYOUT row 2), i.e. x=5 (col), y=2 (row) —
// the house rule's own "x is horizontal" convention.
const PLUS_SQUARE: Position = { row: 2, col: 5 };

describe('substituteValueAt', () => {
  it('delegates to Arithmetic.substituteAt when the variant defines one', () => {
    const sixX = polynomial(fraction(6), 1, 0);
    expect(substituteValueAt(sixX, PLUS_SQUARE, polynomialArithmetic)).toEqual(polynomial(fraction(30))); // 6*5
  });

  it('returns the value unchanged for a variant with no substituteAt', () => {
    expect(substituteValueAt(7, PLUS_SQUARE, numberArithmetic)).toBe(7);
  });
});

describe('scoreCaptureAt (coordinate-substitution house rule — deliberate variant addition, not from the rulebook itself)', () => {
  it('evaluates both operands at the landing square, then applies the landing operation — 6x + 10y at (5,2) = 6*5 + 10*2 = 50', () => {
    const taker = polyPiece('white', polynomial(fraction(6), 1, 0)); // 6x
    const taken = polyPiece('black', polynomial(fraction(10), 0, 1)); // 10y
    expect(scoreCaptureAt(taker, taken, PLUS_SQUARE, polynomialArithmetic)).toEqual(polynomial(fraction(50)));
  });

  it('still applies the Dama multiplier on top of the substituted, already-numeric result', () => {
    const taker = polyPiece('white', polynomial(fraction(6), 1, 0), true); // dama 6x
    const taken = polyPiece('black', polynomial(fraction(10), 0, 1)); // 10y
    expect(scoreCaptureAt(taker, taken, PLUS_SQUARE, polynomialArithmetic)).toEqual(polynomial(fraction(100))); // (30+20)*2
  });

  it('is exactly scoreCapture(..., operationAt(landedAt), ...) for every variant without substituteAt', () => {
    const taker = ordinary('white', 3);
    const taken = ordinary('black', 5);
    expect(scoreCaptureAt(taker, taken, PLUS_SQUARE, numberArithmetic)).toBe(scoreCapture(taker, taken, '+', numberArithmetic));
  });
});
