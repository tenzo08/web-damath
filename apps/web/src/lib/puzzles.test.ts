import { describe, expect, it } from 'vitest';
import { legalMoves } from '@damath/engine';
import type { AnyVariant, Variant } from '@damath/engine';
import { PUZZLES, PUZZLE_VARIANTS, dailySeed, generatePuzzle, getDailyPuzzle, legalSolutionMove, puzzleSolvedState, puzzleStartState } from './puzzles';

/** Same union-distribution trick App.tsx and PuzzleScreen.tsx already rely on to recover a concrete `V` from `AnyVariant` at a call site. */
type ValueOf<T> = T extends Variant<infer V> ? V : never;
type AnyPuzzleValue = ValueOf<AnyVariant>;

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

describe('generatePuzzle', () => {
  for (const variant of PUZZLE_VARIANTS) {
    it(`produces a real, legal puzzle for ${variant.name} (run repeatedly -- random, not a single lucky seed)`, () => {
      for (let i = 0; i < 20; i++) {
        const puzzle = generatePuzzle<AnyPuzzleValue>(variant);
        expect(puzzle).not.toBeNull();
        if (!puzzle) continue; // narrows for TS below; the assertion above already fails the test if this ever hits
        expect(puzzle.variant).toBe(variant);

        // Same shape puzzles.test.ts already holds the curated PUZZLES to: a real,
        // reachable setup and a solution that's genuinely a legal move there.
        expect(() => puzzleStartState(puzzle)).not.toThrow();
        const state = puzzleStartState(puzzle);
        const moves = legalMoves(state);
        expect(
          moves.some(
            (m) =>
              m.from.row === puzzle.solutionFrom.row &&
              m.from.col === puzzle.solutionFrom.col &&
              m.to.row === puzzle.solutionTo.row &&
              m.to.col === puzzle.solutionTo.col,
          ),
        ).toBe(true);

        const solution = legalSolutionMove(puzzle);
        expect(solution).not.toBeNull();
        expect(() => puzzleSolvedState(puzzle)).not.toThrow();
      }
    });
  }

  it('never repeats an id across many calls, even across variants', () => {
    const ids = new Set<string>();
    for (const variant of PUZZLE_VARIANTS) {
      for (let i = 0; i < 10; i++) {
        const puzzle = generatePuzzle<AnyPuzzleValue>(variant);
        if (puzzle) ids.add(puzzle.id);
      }
    }
    expect(ids.size).toBe(PUZZLE_VARIANTS.length * 10);
  });
});

describe('daily puzzle', () => {
  it('dailySeed is a stable UTC calendar-date integer, not affected by time of day', () => {
    expect(dailySeed(new Date(Date.UTC(2026, 7, 7, 0, 0, 0)))).toBe(20260807);
    expect(dailySeed(new Date(Date.UTC(2026, 7, 7, 23, 59, 59)))).toBe(20260807);
    expect(dailySeed(new Date(Date.UTC(2026, 0, 1)))).toBe(20260101);
  });

  it('the same UTC day always produces the identical puzzle (same setup, same solution)', () => {
    const day = new Date(Date.UTC(2026, 7, 7));
    const a = getDailyPuzzle(day);
    const b = getDailyPuzzle(new Date(Date.UTC(2026, 7, 7, 18, 30)));
    expect(a.id).toBe(b.id);
    expect(a.setupMoves).toEqual(b.setupMoves);
    expect(a.solutionFrom).toEqual(b.solutionFrom);
    expect(a.solutionTo).toEqual(b.solutionTo);
  });

  it('different UTC days produce different puzzle ids', () => {
    const a = getDailyPuzzle(new Date(Date.UTC(2026, 7, 7)));
    const b = getDailyPuzzle(new Date(Date.UTC(2026, 7, 8)));
    expect(a.id).not.toBe(b.id);
  });

  it('is a real, legal, solvable puzzle (same shape every curated/generated puzzle is held to)', () => {
    const puzzle = getDailyPuzzle(new Date(Date.UTC(2026, 7, 7)));
    expect(() => puzzleStartState(puzzle)).not.toThrow();
    const state = puzzleStartState(puzzle);
    const moves = legalMoves(state);
    expect(
      moves.some(
        (m) =>
          m.from.row === puzzle.solutionFrom.row &&
          m.from.col === puzzle.solutionFrom.col &&
          m.to.row === puzzle.solutionTo.row &&
          m.to.col === puzzle.solutionTo.col,
      ),
    ).toBe(true);
    expect(() => puzzleSolvedState(puzzle)).not.toThrow();
  });

  it("id always starts with 'daily-' and encodes the seed", () => {
    const puzzle = getDailyPuzzle(new Date(Date.UTC(2026, 7, 7)));
    expect(puzzle.id).toBe('daily-20260807');
  });
});
