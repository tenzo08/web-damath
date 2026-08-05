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

/** All seven official variants (docs/VARIANTS.md, "Variant interface"). */
export type VariantId =
  | 'counting'
  | 'whole'
  | 'fraction'
  | 'integer'
  | 'rational'
  | 'radical'
  | 'polynomial';

/** The three variants `packages/ai` plays — an evaluation function needs a numeric scale (docs/AI_OPPONENT.md §4). */
export type IntegerVariantId = 'whole' | 'counting' | 'integer';

export interface Piece<V> {
  readonly id: string;
  readonly value: V;
  readonly owner: Player;
  readonly isDama: boolean;
}

export type Board<V> = readonly (readonly (Piece<V> | null)[])[];

/** One jump within a (possibly chained) capture: the enemy taken and where the taker lands. */
export interface CaptureStep<V> {
  readonly capturedPiece: Piece<V>;
  readonly capturedAt: Position;
  readonly landedAt: Position;
}

export interface Move<V> {
  readonly from: Position;
  /** Final square the taker ends on — equal to the last step's `landedAt` for a capture. */
  readonly to: Position;
  /** Empty for a quiet move; one entry per jump for a (possibly chained) capture. */
  readonly captures: readonly CaptureStep<V>[];
}

export interface GameState<V> {
  readonly board: Board<V>;
  readonly turn: Player;
  readonly scores: Readonly<Record<Player, V>>;
  readonly moveHistory: readonly Move<V>[];
  readonly status: 'active' | 'finished';
  readonly variant: VariantId;
}
