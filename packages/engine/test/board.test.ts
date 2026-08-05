import { describe, expect, it } from 'vitest';
import { createGame, deserialize, pieceAt, serialize } from '../src/board.js';
import type { GameState } from '../src/types.js';

describe('createGame', () => {
  it('places exactly 12 white pieces on rows 0-2 and 12 black pieces on rows 5-7', () => {
    const state = createGame('integer');
    let white = 0;
    let black = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (!piece) continue;
        expect(piece.isDama).toBe(false);
        if (piece.owner === 'white') {
          white++;
          expect(row).toBeLessThanOrEqual(2);
        } else {
          black++;
          expect(row).toBeGreaterThanOrEqual(5);
        }
      }
    }
    expect(white).toBe(12);
    expect(black).toBe(12);
  });

  it('leaves rows 3 and 4 empty', () => {
    const state = createGame('integer');
    for (const row of [3, 4]) {
      for (let col = 0; col < 8; col++) {
        expect(state.board[row]?.[col] ?? null).toBeNull();
      }
    }
  });

  it('starts white to move, zero scores, empty history, active status', () => {
    const state = createGame('whole');
    expect(state.turn).toBe('white');
    expect(state.scores).toEqual({ white: 0, black: 0 });
    expect(state.moveHistory).toEqual([]);
    expect(state.status).toBe('active');
  });

  it('places Integer Damath values per Mapping A, spot-checked against the rulebook diagram', () => {
    const state = createGame('integer');
    // Row 2 (white, nearest centre) = printed line 1 "-9 6 -1 4" ascending column.
    expect(pieceAt(state.board, { row: 2, col: 1 })?.value).toBe(-9);
    expect(pieceAt(state.board, { row: 2, col: 3 })?.value).toBe(6);
    expect(pieceAt(state.board, { row: 2, col: 5 })?.value).toBe(-1);
    expect(pieceAt(state.board, { row: 2, col: 7 })?.value).toBe(4);
    // Row 0 (white back row) = printed line 3 "-11 8 -5 2" ascending column.
    expect(pieceAt(state.board, { row: 0, col: 1 })?.value).toBe(-11);
    expect(pieceAt(state.board, { row: 0, col: 7 })?.value).toBe(2);
    // Black is the 180-degree rotation of white: (row,col) -> (7-row, 7-col).
    expect(pieceAt(state.board, { row: 5, col: 6 })?.value).toBe(-9);
    expect(pieceAt(state.board, { row: 7, col: 6 })?.value).toBe(-11);
  });

  it('every playable-square piece is on a valid (row+col) odd square', () => {
    const state = createGame('counting');
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (state.board[row]?.[col]) {
          expect((row + col) % 2).toBe(1);
        }
      }
    }
  });

  it('each variant places its full 12-value set with none left over', () => {
    for (const id of ['whole', 'counting', 'integer'] as const) {
      const state = createGame(id);
      const whiteValues: number[] = [];
      for (let row = 0; row <= 2; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = state.board[row]?.[col];
          if (piece?.owner === 'white') whiteValues.push(piece.value);
        }
      }
      expect(whiteValues).toHaveLength(12);
    }
  });
});

describe('serialize / deserialize', () => {
  it('round-trips to an equivalent state', () => {
    const state = createGame('integer');
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
  });

  it('round-trips after moveHistory and scores change', () => {
    const state: GameState = {
      ...createGame('whole'),
      turn: 'black',
      scores: { white: 5, black: -3 },
      status: 'finished',
    };
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
  });
});
