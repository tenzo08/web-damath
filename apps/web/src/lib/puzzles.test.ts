import { describe, expect, it } from 'vitest';
import { legalMoves } from '@damath/engine';
import { PUZZLES, legalSolutionMove, puzzleSolvedState, puzzleStartState } from './puzzles';

describe('puzzle data', () => {
  for (const puzzle of PUZZLES) {
    describe(puzzle.id, () => {
      it('replays its setup moves to a real, legal position (never throws)', () => {
        expect(() => puzzleStartState(puzzle)).not.toThrow();
      });

      it('has a solution that is currently a legal move at the replayed position', () => {
        const solution = legalSolutionMove(puzzle);
        expect(solution).not.toBeNull();
      });

      it('has a solution among the legal moves list, not just a coincidental from/to match', () => {
        const state = puzzleStartState(puzzle);
        const moves = legalMoves(state);
        expect(moves.some((m) => m.from.row === puzzle.solutionFrom.row && m.from.col === puzzle.solutionFrom.col && m.to.row === puzzle.solutionTo.row && m.to.col === puzzle.solutionTo.col)).toBe(true);
      });

      it('resolves to a finished apply with a real score change (a genuine capture, not a no-op)', () => {
        expect(() => puzzleSolvedState(puzzle)).not.toThrow();
        const before = puzzleStartState(puzzle);
        const after = puzzleSolvedState(puzzle);
        const mover = before.turn;
        expect(after.scores[mover]).not.toBe(before.scores[mover]);
      });
    });
  }

  it('has unique ids', () => {
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
