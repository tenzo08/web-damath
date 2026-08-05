import { describe, expect, it } from 'vitest';
import { createGame } from '../src/board.js';
import { legalMoves } from '../src/moves.js';
import type { GameState, Piece, Player, Position } from '../src/types.js';

/** A mostly-empty 8x8 board with only the given pieces placed, for testing one rule in isolation. */
function stateWith(
  placements: readonly [Position, Piece][],
  turn: Player = 'white',
): GameState {
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () => new Array(8).fill(null));
  for (const [pos, piece] of placements) {
    board[pos.row]![pos.col] = piece;
  }
  return {
    board,
    turn,
    scores: { white: 0, black: 0 },
    moveHistory: [],
    status: 'active',
    variant: 'integer',
  };
}

function ordinary(owner: Player, value = 1): Piece {
  return { id: `${owner}-test`, value, owner, isDama: false };
}

function dama(owner: Player, value = 1): Piece {
  return { id: `${owner}-dama-test`, value, owner, isDama: true };
}

describe('opening position (§3.3)', () => {
  it('white has exactly 7 legal quiet moves, all from row 2', () => {
    for (const id of ['whole', 'counting', 'integer'] as const) {
      const moves = legalMoves(createGame(id));
      expect(moves).toHaveLength(7);
      for (const move of moves) {
        expect(move.captures).toEqual([]);
        expect(move.from.row).toBe(2);
        expect(move.to.row).toBe(3);
      }
    }
  });
});

describe('mandatory capture (§4.2)', () => {
  it('excludes quiet moves when any capture exists, even for a different piece', () => {
    const state = stateWith([
      [{ row: 2, col: 3 }, ordinary('white')], // can capture
      [{ row: 3, col: 4 }, ordinary('black')],
      // (4,5) vacant landing
      [{ row: 2, col: 1 }, ordinary('white')], // would otherwise have a quiet move to (3,0)/(3,2)
    ]);
    const moves = legalMoves(state);
    expect(moves.every((m) => m.captures.length > 0)).toBe(true);
    expect(moves.some((m) => m.from.row === 2 && m.from.col === 1)).toBe(false);
  });
});

describe('maximal capture (§4.3)', () => {
  it('a 1-chip capture is illegal when a 2-chip chain exists', () => {
    const state = stateWith([
      [{ row: 2, col: 7 }, ordinary('white')],
      // chain of 2: (3,6)->(4,5)->(5,4)->(6,3)
      [{ row: 3, col: 6 }, ordinary('black')],
      [{ row: 5, col: 4 }, ordinary('black')],
      // a separate, shorter 1-chip capture option for a different piece,
      // geometrically disjoint so it can't fold into the chain above
      [{ row: 2, col: 1 }, ordinary('white')],
      [{ row: 1, col: 2 }, ordinary('black')],
      // (0,3) vacant landing
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.captures).toHaveLength(2);
    expect(moves[0]!.from).toEqual({ row: 2, col: 7 });
    expect(moves[0]!.to).toEqual({ row: 6, col: 3 });
  });
});

describe('chain capture continuation (§4.5)', () => {
  it('records each jump of a length-2 chain individually, landing square first', () => {
    const state = stateWith([
      [{ row: 2, col: 7 }, ordinary('white')],
      [{ row: 3, col: 6 }, ordinary('black')],
      [{ row: 5, col: 4 }, ordinary('black')],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    const [first, second] = moves[0]!.captures;
    expect(first).toEqual({
      capturedPiece: expect.objectContaining({ owner: 'black' }),
      capturedAt: { row: 3, col: 6 },
      landedAt: { row: 4, col: 5 },
    });
    expect(second).toEqual({
      capturedPiece: expect.objectContaining({ owner: 'black' }),
      capturedAt: { row: 5, col: 4 },
      landedAt: { row: 6, col: 3 },
    });
  });
});

describe('dama-eat-first (§4.4)', () => {
  it('excludes an ordinary chip\'s capture when a dama capture ties the maximal count', () => {
    const state = stateWith([
      // ordinary chip's own 2-chain (disjoint squares from the dama's path below)
      [{ row: 2, col: 7 }, ordinary('white')],
      [{ row: 3, col: 6 }, ordinary('black')],
      [{ row: 5, col: 4 }, ordinary('black')],
      // dama's 2-chain
      [{ row: 0, col: 1 }, dama('white')],
      [{ row: 2, col: 3 }, ordinary('black')],
      [{ row: 5, col: 2 }, ordinary('black')],
    ]);
    const moves = legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      const piece = state.board[move.from.row]![move.from.col]!;
      expect(piece.isDama).toBe(true);
    }
    // the ordinary chip's tied 2-chain must not appear at all
    expect(moves.some((m) => m.from.row === 2 && m.from.col === 7)).toBe(false);
  });
});

describe('dama long-range capture with multiple landing squares (§6.4)', () => {
  it('offers one Move per vacant square beyond the captured chip', () => {
    const state = stateWith([
      [{ row: 0, col: 1 }, dama('white')],
      [{ row: 2, col: 3 }, ordinary('black')],
      // (3,4) (4,5) (5,6) (6,7) all vacant beyond it
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(4);
    const landings = moves.map((m) => m.to).sort((a, b) => a.row - b.row);
    expect(landings).toEqual([
      { row: 3, col: 4 },
      { row: 4, col: 5 },
      { row: 5, col: 6 },
      { row: 6, col: 7 },
    ]);
    for (const move of moves) {
      expect(move.captures).toHaveLength(1);
      expect(move.captures[0]!.capturedAt).toEqual({ row: 2, col: 3 });
    }
  });
});

describe('dama movement, blocked by any chip in path (§6.3)', () => {
  it('cannot slide past an occupied square, own or enemy', () => {
    const state = stateWith([
      [{ row: 0, col: 1 }, dama('white')],
      [{ row: 3, col: 4 }, ordinary('white')], // blocks the (+1,+1) direction beyond it
    ]);
    const moves = legalMoves(state);
    const damaMoves = moves.filter((m) => m.from.row === 0 && m.from.col === 1);
    const destinations = damaMoves.map((m) => m.to).sort((a, b) => a.row - b.row || a.col - b.col);
    // (+1,+1) direction stops at (2,3), the square just short of the blocker at (3,4);
    // (+1,-1) direction has exactly one square, (1,0), before running off the board.
    expect(destinations).toEqual([
      { row: 1, col: 0 },
      { row: 1, col: 2 },
      { row: 2, col: 3 },
    ]);
  });
});

describe('ordinary chip captures in any diagonal direction (§3.4, §4.1)', () => {
  it('captures backward even though movement is forward-only', () => {
    // white moves toward increasing row; a capture toward decreasing row must still work.
    const state = stateWith([
      [{ row: 4, col: 3 }, ordinary('white')],
      [{ row: 3, col: 2 }, ordinary('black')],
      // (2,1) vacant landing, backward relative to white's forward direction
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toEqual({ row: 2, col: 1 });
    expect(moves[0]!.captures[0]!.capturedAt).toEqual({ row: 3, col: 2 });
  });
});
