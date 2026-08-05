import { describe, expect, it } from 'vitest';
import {
  OPERATION_LAYOUT,
  PROMOTION_SQUARES_ROW_0,
  PROMOTION_SQUARES_ROW_7,
} from '../src/data/operation-layout.js';

describe('OPERATION_LAYOUT', () => {
  it('has exactly 32 entries', () => {
    expect(OPERATION_LAYOUT).toHaveLength(32);
  });

  it('every entry is on a playable square: (row + col) % 2 === 1', () => {
    for (const { row, col } of OPERATION_LAYOUT) {
      expect((row + col) % 2).toBe(1);
    }
  });

  it('has no duplicate squares', () => {
    const keys = OPERATION_LAYOUT.map(({ row, col }) => `${row},${col}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no gaps: covers every playable square on the 8x8 board', () => {
    // Independently enumerate every square satisfying the playable-square
    // rule (§1.2) and confirm the layout has an entry for each one. This is
    // the proof that a missing key cannot silently default to "+" the way
    // reference/backend/engine/board.py's calc_score does.
    const expectedPlayableSquares = new Set<string>();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          expectedPlayableSquares.add(`${row},${col}`);
        }
      }
    }
    expect(expectedPlayableSquares.size).toBe(32);

    const actualSquares = new Set(OPERATION_LAYOUT.map(({ row, col }) => `${row},${col}`));
    expect(actualSquares).toEqual(expectedPlayableSquares);
  });

  it('rows follow the four-row repeating cycle from §1.3', () => {
    const byRow = (row: number) =>
      OPERATION_LAYOUT.filter((s) => s.row === row)
        .sort((a, b) => a.col - b.col)
        .map((s) => s.operation);

    // row%4 === 3 -> [*, /, -, +]; row%4 === 2 -> [/, *, +, -];
    // row%4 === 1 -> [-, +, *, /]; row%4 === 0 -> [+, -, /, *]
    expect(byRow(3)).toEqual(byRow(7));
    expect(byRow(2)).toEqual(byRow(6));
    expect(byRow(1)).toEqual(byRow(5));
    expect(byRow(0)).toEqual(byRow(4));

    expect(byRow(7)).toEqual(['*', '/', '-', '+']);
    expect(byRow(6)).toEqual(['/', '*', '+', '-']);
    expect(byRow(5)).toEqual(['-', '+', '*', '/']);
    expect(byRow(4)).toEqual(['+', '-', '/', '*']);
  });
});

describe('promotion squares (§6.1)', () => {
  it('row-0 promotion squares match the rulebook explicit list (1,0)(3,0)(5,0)(7,0)', () => {
    const asColRow = PROMOTION_SQUARES_ROW_0.map(({ row, col }) => [col, row]).sort(
      (a, b) => a[0]! - b[0]!,
    );
    expect(asColRow).toEqual([
      [1, 0],
      [3, 0],
      [5, 0],
      [7, 0],
    ]);
  });

  it('row-7 promotion squares match the rulebook explicit list (0,7)(2,7)(4,7)(6,7)', () => {
    const asColRow = PROMOTION_SQUARES_ROW_7.map(({ row, col }) => [col, row]).sort(
      (a, b) => a[0]! - b[0]!,
    );
    expect(asColRow).toEqual([
      [0, 7],
      [2, 7],
      [4, 7],
      [6, 7],
    ]);
  });

  it('promotion squares are exactly the playable squares of each home row', () => {
    expect(PROMOTION_SQUARES_ROW_0).toHaveLength(4);
    expect(PROMOTION_SQUARES_ROW_7).toHaveLength(4);
  });
});
