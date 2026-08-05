import { describe, expect, it } from 'vitest';
import { applyMove, createGame, legalMoves } from '@damath/engine';
import type { GameState, Piece, Player, Position } from '@damath/engine';
import { buildLedgerEntry, formatLedgerRow } from './ledger';

function stateWith(placements: readonly [Position, Piece][], turn: Player = 'white'): GameState {
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

function ordinary(owner: Player, value: number): Piece {
  return { id: `${owner}-${String(value)}`, value, owner, isDama: false };
}

describe('buildLedgerEntry', () => {
  it('renders a quiet opening move with an arrow and no arithmetic', () => {
    const before = createGame('integer');
    const move = legalMoves(before)[0];
    if (!move) throw new Error('expected a legal opening move');
    const mover = before.board[move.from.row]?.[move.from.col];
    if (!mover) throw new Error('expected a piece at the move origin');

    const after = applyMove(before, move);
    const entry = buildLedgerEntry(before, mover, move, after);
    const row = formatLedgerRow(entry);

    expect(entry.steps).toHaveLength(0);
    expect(entry.delta).toBe(0);
    expect(row.path).toContain('→');
    expect(row.arithmetic).toBe('');
    expect(row.promoted).toBe(false);
  });

  it('renders a capture with the landing operation and score, matching applyMove exactly', () => {
    // (2,3) x4 captures (3,4) x3 landing (4,5) op '/': 4/3 -> trunc(1.33)=1
    const before = stateWith([
      [{ row: 2, col: 3 }, ordinary('white', 4)],
      [{ row: 3, col: 4 }, ordinary('black', 3)],
    ]);
    const move = legalMoves(before)[0];
    if (!move) throw new Error('expected the mandatory capture');
    const mover = before.board[2]?.[3];
    if (!mover) throw new Error('expected the white piece at (2,3)');

    const after = applyMove(before, move);
    const entry = buildLedgerEntry(before, mover, move, after);
    const row = formatLedgerRow(entry);

    expect(entry.steps).toHaveLength(1);
    expect(entry.delta).toBe(after.scores.white);
    expect(entry.runningTotal).toBe(after.scores.white);
    expect(row.arithmetic).toBe(`4 ÷ 3 = ${String(entry.delta)}`);
    expect(row.path).toBe('d3÷f5');
  });

  it('marks promotion only when the piece actually promotes on this move', () => {
    const before = stateWith([[{ row: 6, col: 1 }, ordinary('white', 5)]]);
    const move = { from: { row: 6, col: 1 }, to: { row: 7, col: 2 }, captures: [] };
    const mover = before.board[6]?.[1];
    if (!mover) throw new Error('expected the white piece at (6,1)');
    const after = applyMove(before, move);
    const entry = buildLedgerEntry(before, mover, move, after);
    expect(entry.promoted).toBe(true);
  });
});
