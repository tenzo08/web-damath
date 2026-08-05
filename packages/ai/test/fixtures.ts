import type { GameState, Piece, Player, Position } from '@damath/engine';

/** A mostly-empty 8x8 board with only the given pieces placed — mirrors packages/engine/test's convention. */
export function stateWith(
  placements: readonly [Position, Piece<number>][],
  options: Partial<Pick<GameState<number>, 'turn' | 'scores'>> = {},
): GameState<number> {
  const board: (Piece<number> | null)[][] = Array.from({ length: 8 }, () => new Array(8).fill(null));
  for (const [pos, piece] of placements) {
    const row = board[pos.row];
    if (!row) throw new Error(`Row ${String(pos.row)} is out of bounds`);
    row[pos.col] = piece;
  }
  return {
    board,
    turn: options.turn ?? 'white',
    scores: options.scores ?? { white: 0, black: 0 },
    moveHistory: [],
    status: 'active',
    variant: 'integer',
  };
}

let nextId = 0;

export function ordinary(owner: Player, value: number, id = `${owner}-${String(value)}-${String(nextId++)}`): Piece<number> {
  return { id, value, owner, isDama: false };
}

export function dama(owner: Player, value: number, id = `${owner}-dama-${String(value)}-${String(nextId++)}`): Piece<number> {
  return { id, value, owner, isDama: true };
}
