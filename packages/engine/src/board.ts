import { OPERATION_LAYOUT } from './data/operation-layout.js';
import type { Variant } from './arithmetic.js';
import type { Board, GameState, Piece, Player, Position } from './types.js';

export const BOARD_SIZE = 8;

export function isOnBoard(pos: Position): boolean {
  return pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE;
}

export function pieceAt<V>(board: Board<V>, pos: Position): Piece<V> | null {
  return board[pos.row]?.[pos.col] ?? null;
}

/**
 * White's 12 starting squares (rows 0-2), ordered to receive the variant's 12
 * values in printed order (line 1, then 2, then 3, left to right within each
 * line). This is Mapping A (KNOWLEDGE.md, "Chip-row orientation"): the first
 * printed line goes on the row nearest the centre (row 2), the last on white's
 * own back row (row 0). Sorted row descending, then column ascending — row 2
 * first, row 0 last; ascending column within each row matches the printed
 * left-to-right order.
 */
function whiteStartingSquares(): readonly Position[] {
  return OPERATION_LAYOUT.filter((s) => s.row <= 2)
    .map(({ row, col }): Position => ({ row, col }))
    .sort((a, b) => b.row - a.row || a.col - b.col);
}

/**
 * Black's layout is the 180-degree rotation of white's (docs/VARIANTS.md), so
 * black's squares are white's squares rotated about the board centre, in the
 * same order — receiving the same 12 values in the same printed order.
 */
function rotate180(pos: Position): Position {
  return { row: BOARD_SIZE - 1 - pos.row, col: BOARD_SIZE - 1 - pos.col };
}

function placePiece<V>(board: (Piece<V> | null)[][], pos: Position, piece: Piece<V>): void {
  const row = board[pos.row];
  if (!row) {
    throw new Error(`Row ${String(pos.row)} is out of bounds`);
  }
  row[pos.col] = piece;
}

export function createGame<V>(variant: Variant<V>): GameState<V> {
  const whiteSquares = whiteStartingSquares();

  const board: (Piece<V> | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    new Array<Piece<V> | null>(BOARD_SIZE).fill(null),
  );

  whiteSquares.forEach((square, i) => {
    const value = variant.values.at(i);
    if (value === undefined) {
      throw new Error(
        `${variant.id} has fewer values (${String(variant.values.length)}) than starting squares (${String(whiteSquares.length)})`,
      );
    }

    placePiece(board, square, { id: `white-${String(i)}`, value, owner: 'white', isDama: false });
    placePiece(board, rotate180(square), {
      id: `black-${String(i)}`,
      value,
      owner: 'black',
      isDama: false,
    });
  });

  const zeroScores: Record<Player, V> = { white: variant.arithmetic.zero, black: variant.arithmetic.zero };

  return {
    board: Object.freeze(board.map((row) => Object.freeze(row.slice()))),
    turn: 'white',
    scores: zeroScores,
    moveHistory: [],
    status: 'active',
    variant: variant.id,
  };
}

export function serialize<V>(state: GameState<V>): string {
  return JSON.stringify(state);
}

export function deserialize<V>(json: string): GameState<V> {
  const parsed = JSON.parse(json) as GameState<V>;
  return {
    ...parsed,
    board: Object.freeze(parsed.board.map((row) => Object.freeze(row.slice()))),
  };
}
