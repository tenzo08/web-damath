import { describe, expect, it } from 'vitest';
import { scoreCapture } from '../src/scoring.js';
import type { Piece, Player } from '../src/types.js';

function ordinary(owner: Player, value: number): Piece {
  return { id: `${owner}-test`, value, owner, isDama: false };
}

function dama(owner: Player, value: number): Piece {
  return { id: `${owner}-dama-test`, value, owner, isDama: true };
}

describe('multiplier table (§5.3)', () => {
  it('ordinary takes ordinary: x1', () => {
    expect(scoreCapture(ordinary('white', 3), ordinary('black', 5), '+')).toBe(8);
  });

  it('dama takes ordinary: x2', () => {
    expect(scoreCapture(dama('white', 3), ordinary('black', 5), '+')).toBe(16);
  });

  it('ordinary takes dama: x2', () => {
    expect(scoreCapture(ordinary('white', 3), dama('black', 5), '+')).toBe(16);
  });

  it('dama takes dama: x4', () => {
    expect(scoreCapture(dama('white', 3), dama('black', 5), '+')).toBe(32);
  });
});

describe('division by zero (§5.5)', () => {
  it('contributes 0 regardless of the taker value or multiplier', () => {
    expect(scoreCapture(ordinary('white', 7), ordinary('black', 0), '/')).toBe(0);
    expect(scoreCapture(dama('white', 7), dama('black', 0), '/')).toBe(0);
  });
});

describe('negative score via subtraction (§5.2)', () => {
  it('reduces the taker total when the taken value is larger', () => {
    expect(scoreCapture(ordinary('white', 2), ordinary('black', 5), '-')).toBe(-3);
  });
});

describe('division truncation (KNOWLEDGE.md, "Division truncation")', () => {
  it('a magnitude under 1 counts as 0', () => {
    expect(scoreCapture(ordinary('white', 2), ordinary('black', 5), '/')).toBe(0);
  });

  it('otherwise truncates toward zero', () => {
    expect(scoreCapture(ordinary('white', -7), ordinary('black', 2), '/')).toBe(-3);
  });
});
