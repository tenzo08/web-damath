import { describe, expect, it } from 'vitest';
import { STEPS, type Step } from './TutorialModal';
import type { MiniSquareSpec } from './diagram/MiniBoard';

/**
 * These diagrams are illustrative excerpts, not positions replayed through the real
 * engine (`lib/puzzles.ts`'s `PUZZLES` are that already) -- so nothing here can call
 * `legalMoves`. Instead this mechanically checks the two properties a human reviewer
 * would otherwise have to eyeball: every diagram is a real checkerboard (playable iff
 * `row + col` is odd, `docs/DAMATH_RULES.md` §1.2), and every arrow's `to` is actually
 * reachable from its `from` by a real one-step diagonal move or a real two-step
 * diagonal jump over an occupied square -- the exact shape of bug this test was written
 * after finding by hand (a "capture" arrow that wasn't on any diagonal at all, and a
 * chain whose second jump landed one column short of the piece it was supposed to pass
 * over).
 */

function cellAt(board: (MiniSquareSpec | null)[][], row: number, col: number): MiniSquareSpec | null {
  return board[row]?.[col] ?? null;
}

const boardsToCheck: { title: string; board: (MiniSquareSpec | null)[][] }[] = STEPS.filter(
  (s): s is Step & { board: (MiniSquareSpec | null)[][] } => s.board !== undefined,
).map((s) => ({ title: s.title, board: s.board }));

describe('tutorial diagrams', () => {
  for (const { title, board } of boardsToCheck) {
    describe(title, () => {
      it('is a real checkerboard -- playable iff (row + col) is odd', () => {
        board.forEach((row, r) => {
          row.forEach((sq, c) => {
            const playable = sq?.playable !== false;
            expect(playable, `(${String(r)},${String(c)}) should be ${(r + c) % 2 === 1 ? 'playable' : 'void'}`).toBe((r + c) % 2 === 1);
          });
        });
      });

      it('every piece/highlight/badge sits on a playable square', () => {
        board.forEach((row, r) => {
          row.forEach((sq, c) => {
            if (!sq) return;
            const hasContent = sq.piece !== undefined || sq.highlight !== undefined || sq.badge !== undefined || sq.operation !== undefined;
            if (hasContent) expect(sq.playable, `(${String(r)},${String(c)}) has content but is marked void`).not.toBe(false);
          });
        });
      });
    });
  }

  for (const step of STEPS) {
    const arrows = step.arrows;
    if (!arrows || arrows.length === 0) continue;
    describe(step.title, () => {
      for (const arrow of arrows) {
        const label = `${JSON.stringify(arrow.from)} -> ${JSON.stringify(arrow.to)}`;

        it(`arrow ${label} is a real diagonal ${arrow.kind ?? 'move'}`, () => {
          const dRow = arrow.to.row - arrow.from.row;
          const dCol = arrow.to.col - arrow.from.col;
          if ((arrow.kind ?? 'move') === 'move') {
            expect(Math.abs(dRow)).toBe(1);
            expect(Math.abs(dCol)).toBe(1);
          } else {
            expect(Math.abs(dRow)).toBe(2);
            expect(Math.abs(dCol)).toBe(2);
          }
        });

        const board = step.board;
        if (arrow.kind === 'capture' && board) {
          it(`arrow ${label} jumps over an occupied square`, () => {
            const midRow = (arrow.from.row + arrow.to.row) / 2;
            const midCol = (arrow.from.col + arrow.to.col) / 2;
            const captured = cellAt(board, midRow, midCol);
            expect(captured?.piece, `no piece at the jumped-over square (${String(midRow)},${String(midCol)})`).toBeDefined();
          });
        }
      }
    });
  }

  it('every step title is unique', () => {
    const titles = STEPS.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
