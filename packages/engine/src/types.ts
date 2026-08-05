/**
 * Board geometry types shared by every variant. `row 0` is the bottom row,
 * matching docs/DAMATH_RULES.md §1.1 — rendering flips vertically; the engine
 * never does.
 */

export type Operation = '+' | '-' | '*' | '/';

export interface Position {
  readonly row: number;
  readonly col: number;
}

export interface OperationSquare extends Position {
  readonly operation: Operation;
}
