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

/**
 * `white` starts on rows 0-2 and advances toward row 7; `black` starts on rows
 * 5-7 and advances toward row 0 (docs/DAMATH_RULES.md §2.1).
 */
export type Player = 'white' | 'black';

export interface Piece {
  readonly id: string;
  readonly value: number;
  readonly owner: Player;
  readonly isDama: boolean;
}

export type Board = readonly (readonly (Piece | null)[])[];

/** One jump within a (possibly chained) capture: the enemy taken and where the taker lands. */
export interface CaptureStep {
  readonly capturedPiece: Piece;
  readonly capturedAt: Position;
  readonly landedAt: Position;
}

export interface Move {
  readonly from: Position;
  /** Final square the taker ends on — equal to the last step's `landedAt` for a capture. */
  readonly to: Position;
  /** Empty for a quiet move; one entry per jump for a (possibly chained) capture. */
  readonly captures: readonly CaptureStep[];
}

/** The three integer-valued variants shipped this milestone (docs/VARIANTS.md). */
export type IntegerVariantId = 'whole' | 'counting' | 'integer';

export interface GameState {
  readonly board: Board;
  readonly turn: Player;
  readonly scores: Readonly<Record<Player, number>>;
  readonly moveHistory: readonly Move[];
  readonly status: 'active' | 'finished';
  readonly variant: IntegerVariantId;
}
