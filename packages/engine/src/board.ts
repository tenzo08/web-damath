import { OPERATION_LAYOUT } from './data/operation-layout.js';
import { INTEGER_VARIANTS } from './data/variants.js';
import type { Board, GameState, IntegerVariantId, Piece, Player, Position } from './types.js';

export const BOARD_SIZE = 8;

export function isOnBoard(pos: Position): boolean {
  return pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE;
}

export function pieceAt(board: Board, pos: Position): Piece | null {
  return board[pos.row]?.[pos.col] ?? null;
}

function findVariant(id: IntegerVariantId) {
  const variant = INTEGER_VARIANTS.find((v) => v.id === id);
  if (!variant) {
    throw new Error(`Unknown variant: ${id}`);
  }
  return variant;
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

export function createGame(variantId: IntegerVariantId): GameState {
  const variant = findVariant(variantId);
  const whiteSquares = whiteStartingSquares();

  const board: (Piece | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    new Array<Piece | null>(BOARD_SIZE).fill(null),
  );

  whiteSquares.forEach((square, i) => {
    const value = variant.values[i]!;
    const whitePiece: Piece = { id: `white-${i}`, value, owner: 'white', isDama: false };
    board[square.row]![square.col] = whitePiece;

    const blackSquare = rotate180(square);
    const blackPiece: Piece = { id: `black-${i}`, value, owner: 'black', isDama: false };
    board[blackSquare.row]![blackSquare.col] = blackPiece;
  });

  return {
    board: Object.freeze(board.map((row) => Object.freeze(row.slice()))),
    turn: 'white',
    scores: { white: 0, black: 0 },
    moveHistory: [],
    status: 'active',
    variant: variantId,
  };
}

interface SerializedPiece {
  readonly id: string;
  readonly value: number;
  readonly owner: Player;
  readonly isDama: boolean;
}

interface SerializedGameState {
  readonly board: readonly (SerializedPiece | null)[][];
  readonly turn: Player;
  readonly scores: Readonly<Record<Player, number>>;
  readonly moveHistory: GameState['moveHistory'];
  readonly status: GameState['status'];
  readonly variant: IntegerVariantId;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const parsed = JSON.parse(json) as SerializedGameState;
  return {
    ...parsed,
    board: Object.freeze(parsed.board.map((row) => Object.freeze(row.slice()))),
  };
}
