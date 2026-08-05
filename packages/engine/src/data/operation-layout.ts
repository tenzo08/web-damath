import type { OperationSquare, Position } from '../types.js';

/**
 * The operation carried by each of the 32 playable squares, transcribed
 * verbatim from docs/DAMATH_RULES.md §1.3 (itself verified against the
 * rulebook diagram and the promotion-square list). `row 0` is the bottom row.
 *
 * Data, not conditionals — see packages/engine/test/operation-layout.test.ts
 * for the parity/completeness/uniqueness proof this table has no gaps.
 */
export const OPERATION_LAYOUT: readonly OperationSquare[] = [
  // row 7
  { row: 7, col: 0, operation: '*' },
  { row: 7, col: 2, operation: '/' },
  { row: 7, col: 4, operation: '-' },
  { row: 7, col: 6, operation: '+' },
  // row 6
  { row: 6, col: 1, operation: '/' },
  { row: 6, col: 3, operation: '*' },
  { row: 6, col: 5, operation: '+' },
  { row: 6, col: 7, operation: '-' },
  // row 5
  { row: 5, col: 0, operation: '-' },
  { row: 5, col: 2, operation: '+' },
  { row: 5, col: 4, operation: '*' },
  { row: 5, col: 6, operation: '/' },
  // row 4
  { row: 4, col: 1, operation: '+' },
  { row: 4, col: 3, operation: '-' },
  { row: 4, col: 5, operation: '/' },
  { row: 4, col: 7, operation: '*' },
  // row 3
  { row: 3, col: 0, operation: '*' },
  { row: 3, col: 2, operation: '/' },
  { row: 3, col: 4, operation: '-' },
  { row: 3, col: 6, operation: '+' },
  // row 2
  { row: 2, col: 1, operation: '/' },
  { row: 2, col: 3, operation: '*' },
  { row: 2, col: 5, operation: '+' },
  { row: 2, col: 7, operation: '-' },
  // row 1
  { row: 1, col: 0, operation: '-' },
  { row: 1, col: 2, operation: '+' },
  { row: 1, col: 4, operation: '*' },
  { row: 1, col: 6, operation: '/' },
  // row 0
  { row: 0, col: 1, operation: '+' },
  { row: 0, col: 3, operation: '-' },
  { row: 0, col: 5, operation: '/' },
  { row: 0, col: 7, operation: '*' },
] as const;

/**
 * Player-advancing-to-row-0's promotion squares (§6.1): (1,0)(3,0)(5,0)(7,0)
 * given as (col, row) in the rulebook. Player-advancing-to-row-7's:
 * (0,7)(2,7)(4,7)(6,7). Derived from OPERATION_LAYOUT rather than
 * hard-coded twice — both are exactly the playable squares of their home row.
 */
export const PROMOTION_SQUARES_ROW_0: readonly Position[] = OPERATION_LAYOUT.filter(
  (square) => square.row === 0,
).map(({ row, col }) => ({ row, col }));

export const PROMOTION_SQUARES_ROW_7: readonly Position[] = OPERATION_LAYOUT.filter(
  (square) => square.row === 7,
).map(({ row, col }) => ({ row, col }));
