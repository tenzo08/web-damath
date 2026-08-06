import { INTEGER_DAMATH, WHOLE_DAMATH, applyMove, createGame, legalMoves } from '@damath/engine';
import type { GameState, Move, Player, Position, Variant } from '@damath/engine';

export interface Puzzle {
  id: string;
  variant: Variant<number>;
  title: string;
  /**
   * A short sequence of real, legal (from, to) steps from the starting position — the
   * puzzle's actual starting position is whatever replaying these against
   * `createGame(variant)` produces, never a hand-typed board. Each step is re-resolved
   * against `legalMoves` at replay time (`puzzleStartState`) rather than stored as a
   * full `Move` object, so a puzzle can never silently apply something the engine
   * itself wouldn't currently consider legal — every puzzle here was mined by actually
   * running the engine forward from `createGame` and recording a real, reachable state
   * with the desired tactical shape (a forced capture chain, or two legal captures
   * that tie on length but differ sharply in score — see KNOWLEDGE.md).
   */
  setupMoves: readonly (readonly [Position, Position])[]; // each entry is [from, to]
  solutionFrom: Position;
  solutionTo: Position;
  hint: string;
  explanation: string;
}

function step(fromRow: number, fromCol: number, toRow: number, toCol: number): readonly [Position, Position] {
  return [
    { row: fromRow, col: fromCol },
    { row: toRow, col: toCol },
  ];
}

export const PUZZLES: readonly Puzzle[] = [
  {
    id: 'whole-1',
    variant: WHOLE_DAMATH,
    title: 'Find the forced chain',
    setupMoves: [step(2, 1, 3, 2), step(5, 2, 4, 1), step(2, 3, 3, 4)],
    solutionFrom: { row: 4, col: 1 },
    solutionTo: { row: 4, col: 5 },
    hint: 'Dark has exactly one legal move — a capture chain. Find the piece that must move, then find where the chain ends.',
    explanation: 'Capture is mandatory, and this chain is the only legal move on the board — every other Dark chip is stuck.',
  },
  {
    id: 'whole-2',
    variant: WHOLE_DAMATH,
    title: 'Pick the better capture',
    setupMoves: [step(2, 1, 3, 0), step(5, 2, 4, 1), step(3, 0, 5, 2)],
    solutionFrom: { row: 6, col: 3 },
    solutionTo: { row: 4, col: 1 },
    hint: 'Two Dark chips can each capture the same Light chip. Both are legal — but they land on very different operation squares.',
    explanation:
      "Damath scores by the landing square's operation, not just by capturing — two equal-length captures can be worlds apart. One nets 19; the other actually loses 2.",
  },
  {
    id: 'integer-1',
    variant: INTEGER_DAMATH,
    title: 'A dramatic swing',
    setupMoves: [step(2, 5, 3, 4), step(5, 4, 4, 5), step(2, 1, 3, 2), step(5, 2, 4, 3), step(3, 2, 3, 6), step(5, 6, 4, 5)],
    solutionFrom: { row: 3, col: 6 },
    solutionTo: { row: 5, col: 4 },
    hint: 'Light has two legal single captures on the board. One is safe but small; the other is the same length and worth far more.',
    explanation: 'Both captures are one step — but the landing squares carry very different operations: 6 points versus 87.',
  },
  {
    id: 'integer-2',
    variant: INTEGER_DAMATH,
    title: 'Read the board before you move',
    setupMoves: [step(2, 5, 3, 4), step(5, 2, 4, 3), step(3, 4, 5, 2)],
    solutionFrom: { row: 6, col: 3 },
    solutionTo: { row: 4, col: 1 },
    hint: 'Two Dark chips can each recapture. Compare where each one lands before you commit.',
    explanation: 'One recapture scores 9; the other, onto a different operation square, actually loses 6.',
  },
];

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function findLegalMove(state: GameState<number>, from: Position, to: Position): Move<number> | null {
  return legalMoves(state).find((m) => samePosition(m.from, from) && samePosition(m.to, to)) ?? null;
}

/** Replays a puzzle's setup steps from a fresh game, re-validating each one against `legalMoves` — throws if a step isn't actually legal at the position it's applied to, since that would mean the puzzle data itself is wrong (caught by puzzles.test.ts for every puzzle in `PUZZLES`, not just at render time). */
export function puzzleStartState(puzzle: Puzzle): GameState<number> {
  let state = createGame(puzzle.variant);
  for (const [from, to] of puzzle.setupMoves) {
    const move = findLegalMove(state, from, to);
    if (!move) {
      throw new Error(`puzzle ${puzzle.id}: setup step (${String(from.row)},${String(from.col)})->(${String(to.row)},${String(to.col)}) is not legal`);
    }
    state = applyMove(state, move, puzzle.variant, { checkGameOver: false });
  }
  return state;
}

/** The actual `Move<number>` (with its real capture chain) matching a puzzle's `solutionFrom`/`solutionTo` — `null` if that isn't currently a legal move, which `puzzles.test.ts` treats as a puzzle-data bug. */
export function legalSolutionMove(puzzle: Puzzle): Move<number> | null {
  return findLegalMove(puzzleStartState(puzzle), puzzle.solutionFrom, puzzle.solutionTo);
}

/** The full resulting state after the solution move — used to reveal what actually happens (including any chain) once solved. */
export function puzzleSolvedState(puzzle: Puzzle): GameState<number> {
  const solution = legalSolutionMove(puzzle);
  if (!solution) throw new Error(`puzzle ${puzzle.id}: its own solutionFrom/solutionTo is not a legal move at the replayed position`);
  return applyMove(puzzleStartState(puzzle), solution, puzzle.variant);
}

export type { Player };
