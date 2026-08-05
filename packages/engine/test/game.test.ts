import { describe, expect, it } from 'vitest';
import { createGame, pieceAt } from '../src/board.js';
import { legalMoves } from '../src/moves.js';
import { applyMove, finalScores, isGameOver } from '../src/game.js';
import { numberArithmetic } from '../src/arithmetic.js';
import { INTEGER_DAMATH, WHOLE_DAMATH } from '../src/data/variants.js';
import type { GameState, Move, Piece, Player, Position } from '../src/types.js';

/** A mostly-empty 8x8 board with only the given pieces placed, for testing one rule in isolation. */
function stateWith(
  placements: readonly [Position, Piece<number>][],
  options: Partial<Pick<GameState<number>, 'turn' | 'scores'>> = {},
): GameState<number> {
  const board: (Piece<number> | null)[][] = Array.from({ length: 8 }, () => new Array(8).fill(null));
  for (const [pos, piece] of placements) {
    board[pos.row]![pos.col] = piece;
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

function ordinary(owner: Player, value: number, id = `${owner}-${String(value)}`): Piece<number> {
  return { id, value, owner, isDama: false };
}

function dama(owner: Player, value: number, id = `${owner}-dama-${String(value)}`): Piece<number> {
  return { id, value, owner, isDama: true };
}

function only(moves: readonly Move<number>[]): Move<number> {
  if (moves.length !== 1) {
    throw new Error(`Expected exactly one legal move, got ${String(moves.length)}`);
  }
  return moves[0]!;
}

describe('chain capture scored as the sum of its jumps (§5.6, fixture 5)', () => {
  it('sums three individually-scored jumps along one diagonal', () => {
    // (0,1) -> capture (1,2) land (2,3) op '*': 4*3=12
    //       -> capture (3,4) land (4,5) op '/': 4/2=2
    //       -> capture (5,6) land (6,7) op '-': 4-6=-2
    // total 12 + 2 - 2 = 12. (6,7) is not a promotion square (row 6), so no promotion here.
    const state = stateWith([
      [{ row: 0, col: 1 }, ordinary('white', 4)],
      [{ row: 1, col: 2 }, ordinary('black', 3)],
      [{ row: 3, col: 4 }, ordinary('black', 2)],
      [{ row: 5, col: 6 }, ordinary('black', 6)],
    ]);
    const move = only(legalMoves(state));
    expect(move.captures).toHaveLength(3);

    const next = applyMove(state, move, INTEGER_DAMATH);
    expect(next.scores.white).toBe(12);
    expect(pieceAt(next.board, { row: 6, col: 7 })).toMatchObject({ owner: 'white', isDama: false });
    for (const pos of [
      { row: 0, col: 1 },
      { row: 1, col: 2 },
      { row: 3, col: 4 },
      { row: 5, col: 6 },
    ]) {
      expect(pieceAt(next.board, pos)).toBeNull();
    }
    expect(next.turn).toBe('black');
    expect(next.moveHistory).toEqual([move]);
  });
});

describe('promotion on landing (§6.1, fixture 6)', () => {
  it('promotes a chip that stops on the far player-home-row square', () => {
    const state = stateWith([[{ row: 6, col: 1 }, ordinary('white', 5)]]);
    const move: Move<number> = { from: { row: 6, col: 1 }, to: { row: 7, col: 2 }, captures: [] };
    const next = applyMove(state, move, INTEGER_DAMATH);
    expect(pieceAt(next.board, { row: 7, col: 2 })).toMatchObject({ isDama: true, value: 5 });
    expect(pieceAt(next.board, { row: 6, col: 1 })).toBeNull();
    expect(next.turn).toBe('black');
  });
});

describe('no promotion when passing through mid-chain (§6.2, fixture 7)', () => {
  it('does not promote a chip that lands on a promotion square mid-chain and keeps capturing', () => {
    // (5,2) -> capture (6,3) land (7,4) [a white promotion square, but the chain continues]
    //       -> capture (6,5) land (5,6) [final square, not a promotion square]
    const state = stateWith([
      [{ row: 5, col: 2 }, ordinary('white', 3)],
      [{ row: 6, col: 3 }, ordinary('black', 2)],
      [{ row: 6, col: 5 }, ordinary('black', 5)],
    ]);
    const move = only(legalMoves(state));
    expect(move.captures).toHaveLength(2);
    expect(move.captures[0]!.landedAt).toEqual({ row: 7, col: 4 });
    expect(move.to).toEqual({ row: 5, col: 6 });

    const next = applyMove(state, move, INTEGER_DAMATH);
    expect(pieceAt(next.board, { row: 5, col: 6 })).toMatchObject({ isDama: false });
    expect(next.scores.white).toBe(1); // (3-2)*1 + trunc(3/5 * 1)=0 => 1 + 0
  });
});

describe('dama long-range capture, landing square determines the score (§6.4, §5.1, fixture 8)', () => {
  it('the same capture scores differently depending on the chosen landing square', () => {
    const state = stateWith([
      [{ row: 0, col: 1 }, dama('white', 5)],
      [{ row: 2, col: 3 }, ordinary('black', 3)],
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(4);

    const expected: Record<string, number> = {
      '3,4': 4, // '-': (5-3)*2 = 4
      '4,5': 3, // '/': trunc((5/3)*2) = 3
      '5,6': 3, // '/': trunc((5/3)*2) = 3
      '6,7': 4, // '-': (5-3)*2 = 4
    };
    for (const move of moves) {
      const key = `${String(move.to.row)},${String(move.to.col)}`;
      const next = applyMove(state, move, INTEGER_DAMATH);
      expect(next.scores.white).toBe(expected[key]);
    }
  });
});

describe('game end by cornering, final scores include remaining chips (§7.3, §8, fixture 12)', () => {
  it('a player with a chip on the board but no legal move at all is cornered', () => {
    const state = stateWith(
      [
        [{ row: 1, col: 0 }, ordinary('black', 5)], // cornered: only forward square is blocked, capture lands off-board
        [{ row: 0, col: 1 }, ordinary('white', 3)], // the blocker
        [{ row: 4, col: 5 }, dama('white', 6)], // unrelated, contributes to white's final score
      ],
      { turn: 'black', scores: { white: 10, black: 4 } },
    );
    expect(legalMoves(state)).toEqual([]);
    expect(isGameOver(state, INTEGER_DAMATH)).toBe(true);
    expect(finalScores(state, numberArithmetic)).toEqual({
      white: 10 + 3 + 6 * 2,
      black: 4 + 5,
    });
  });

  it('applyMove marks the resulting state finished once the opponent is cornered', () => {
    const state = stateWith(
      [
        [{ row: 1, col: 0 }, ordinary('black', 5)],
        [{ row: 0, col: 1 }, ordinary('white', 3)],
        [{ row: 2, col: 1 }, ordinary('white', 1)], // moves elsewhere, unrelated to the corner
      ],
      { turn: 'white' },
    );
    const move: Move<number> = { from: { row: 2, col: 1 }, to: { row: 3, col: 2 }, captures: [] };
    const next = applyMove(state, move, INTEGER_DAMATH);
    expect(next.turn).toBe('black');
    expect(next.status).toBe('finished');
  });
});

describe('threefold repetition ends the game (§7.5, fixture 13)', () => {
  it('the third occurrence of the same position with the same player to move ends the game', () => {
    let state = createGame(INTEGER_DAMATH);

    // Two "teleport" captures reach a two-dama, otherwise-untouched-board scenario in one
    // move each — applyMove trusts its Move argument and never checks single-step legality
    // (that is legalMoves()'s job, exercised elsewhere); it only needs a real piece at `from`
    // and real pieces named in `captures`. This clears (7,2)+(6,1) for white and (0,5)+(1,4)
    // for black, giving each new dama one empty square to shuffle into without disturbing any
    // other piece, and without ever creating a mandatory capture for either side (verified: no
    // other piece pair on the board ends up diagonally adjacent with a vacant landing square).
    const blackAt72 = pieceAt(state.board, { row: 7, col: 2 });
    const blackAt61 = pieceAt(state.board, { row: 6, col: 1 });
    if (!blackAt72 || !blackAt61) throw new Error('expected opening pieces at (7,2) and (6,1)');
    state = applyMove(
      state,
      {
        from: { row: 2, col: 1 },
        to: { row: 7, col: 2 },
        captures: [
          { capturedPiece: blackAt72, capturedAt: { row: 7, col: 2 }, landedAt: { row: 7, col: 2 } },
          { capturedPiece: blackAt61, capturedAt: { row: 6, col: 1 }, landedAt: { row: 7, col: 2 } },
        ],
      },
      INTEGER_DAMATH,
    );

    const whiteAt05 = pieceAt(state.board, { row: 0, col: 5 });
    const whiteAt14 = pieceAt(state.board, { row: 1, col: 4 });
    if (!whiteAt05 || !whiteAt14) throw new Error('expected opening pieces at (0,5) and (1,4)');
    state = applyMove(
      state,
      {
        from: { row: 5, col: 2 },
        to: { row: 0, col: 5 },
        captures: [
          { capturedPiece: whiteAt05, capturedAt: { row: 0, col: 5 }, landedAt: { row: 0, col: 5 } },
          { capturedPiece: whiteAt14, capturedAt: { row: 1, col: 4 }, landedAt: { row: 0, col: 5 } },
        ],
      },
      INTEGER_DAMATH,
    );

    expect(pieceAt(state.board, { row: 7, col: 2 })).toMatchObject({ owner: 'white', isDama: true });
    expect(pieceAt(state.board, { row: 0, col: 5 })).toMatchObject({ owner: 'black', isDama: true });
    expect(state.turn).toBe('white');

    const positionP = state; // occurrence 1
    expect(isGameOver(positionP, INTEGER_DAMATH)).toBe(false);

    const wOut: Move<number> = { from: { row: 7, col: 2 }, to: { row: 6, col: 1 }, captures: [] };
    const wBack: Move<number> = { from: { row: 6, col: 1 }, to: { row: 7, col: 2 }, captures: [] };
    const bOut: Move<number> = { from: { row: 0, col: 5 }, to: { row: 1, col: 4 }, captures: [] };
    const bBack: Move<number> = { from: { row: 1, col: 4 }, to: { row: 0, col: 5 }, captures: [] };

    state = applyMove(state, wOut, INTEGER_DAMATH);
    state = applyMove(state, bOut, INTEGER_DAMATH);
    state = applyMove(state, wBack, INTEGER_DAMATH);
    state = applyMove(state, bBack, INTEGER_DAMATH); // occurrence 2, back to position P with white to move
    expect(state.board).toEqual(positionP.board);
    expect(isGameOver(state, INTEGER_DAMATH)).toBe(false);
    expect(state.status).toBe('active');

    state = applyMove(state, wOut, INTEGER_DAMATH);
    state = applyMove(state, bOut, INTEGER_DAMATH);
    state = applyMove(state, wBack, INTEGER_DAMATH);
    state = applyMove(state, bBack, INTEGER_DAMATH); // occurrence 3
    expect(state.board).toEqual(positionP.board);
    expect(isGameOver(state, INTEGER_DAMATH)).toBe(true);
    expect(state.status).toBe('finished');
  });
});

describe('applyMove is pure (1.8)', () => {
  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const v of Object.values(value)) deepFreeze(v);
    }
    return value;
  }

  it('applying a move to a deep-frozen state neither throws nor mutates it', () => {
    const state = createGame(INTEGER_DAMATH);
    const before = structuredClone(state);
    deepFreeze(state);

    const move = legalMoves(state)[0];
    if (!move) throw new Error('expected at least one legal move from the opening position');

    expect(() => applyMove(state, move, INTEGER_DAMATH)).not.toThrow();
    expect(state).toEqual(before);
  });

  it('replaying moveHistory from createGame reproduces the same state', () => {
    let played = createGame(WHOLE_DAMATH);
    for (let i = 0; i < 6; i++) {
      const move = legalMoves(played)[0];
      if (!move) break;
      played = applyMove(played, move, WHOLE_DAMATH);
    }

    let replayed = createGame(WHOLE_DAMATH);
    for (const move of played.moveHistory) {
      replayed = applyMove(replayed, move, WHOLE_DAMATH);
    }

    expect(replayed).toEqual(played);
  });
});

describe('applyMove({ checkGameOver: false }) skips isGameOver entirely', () => {
  it('leaves status active even when the move would otherwise end the game', () => {
    const state = stateWith(
      [
        [{ row: 1, col: 0 }, ordinary('black', 5)],
        [{ row: 0, col: 1 }, ordinary('white', 3)],
        [{ row: 2, col: 1 }, ordinary('white', 1)], // moves elsewhere, unrelated to the corner
      ],
      { turn: 'white' },
    );
    const move: Move<number> = { from: { row: 2, col: 1 }, to: { row: 3, col: 2 }, captures: [] };

    const checked = applyMove(state, move, INTEGER_DAMATH);
    expect(checked.status).toBe('finished'); // default behaviour, unchanged

    const unchecked = applyMove(state, move, INTEGER_DAMATH, { checkGameOver: false });
    expect(unchecked.status).toBe('active');
    // Everything else about the transition is identical either way.
    expect(unchecked.board).toEqual(checked.board);
    expect(unchecked.turn).toBe(checked.turn);
    expect(unchecked.scores).toEqual(checked.scores);
    expect(unchecked.moveHistory).toEqual(checked.moveHistory);
  });
});
