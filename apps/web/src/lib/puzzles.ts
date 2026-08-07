import { ALL_VARIANTS, COUNTING_DAMATH, INTEGER_DAMATH, WHOLE_DAMATH, applyMove, createGame, legalMoves } from '@damath/engine';
import type { AnyVariant, GameState, Move, Player, Position, Variant } from '@damath/engine';
import { toNumberFor } from '@damath/ai';
import { playerLabel } from './notation';

export interface Puzzle<V = number> {
  id: string;
  variant: Variant<V>;
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

export function findLegalMove<V>(state: GameState<V>, from: Position, to: Position): Move<V> | null {
  return legalMoves(state).find((m) => samePosition(m.from, from) && samePosition(m.to, to)) ?? null;
}

/** Replays a puzzle's setup steps from a fresh game, re-validating each one against `legalMoves` — throws if a step isn't actually legal at the position it's applied to, since that would mean the puzzle data itself is wrong (caught by puzzles.test.ts for every puzzle in `PUZZLES`, not just at render time). */
export function puzzleStartState<V>(puzzle: Puzzle<V>): GameState<V> {
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

/** The actual `Move<V>` (with its real capture chain) matching a puzzle's `solutionFrom`/`solutionTo` — `null` if that isn't currently a legal move, which `puzzles.test.ts` treats as a puzzle-data bug. */
export function legalSolutionMove<V>(puzzle: Puzzle<V>): Move<V> | null {
  return findLegalMove(puzzleStartState(puzzle), puzzle.solutionFrom, puzzle.solutionTo);
}

/** The full resulting state after the solution move — used to reveal what actually happens (including any chain) once solved. */
export function puzzleSolvedState<V>(puzzle: Puzzle<V>): GameState<V> {
  const solution = legalSolutionMove(puzzle);
  if (!solution) throw new Error(`puzzle ${puzzle.id}: its own solutionFrom/solutionTo is not a legal move at the replayed position`);
  return applyMove(puzzleStartState(puzzle), solution, puzzle.variant);
}

/** All seven official variants (`docs/VARIANTS.md`) — puzzle generation is generic over the chip value type `V` (`Puzzle<V>`), using `Arithmetic<V>.compare`/`format` for exact ordering/display and `@damath/ai`'s `toNumberFor` bridge only for the "is this meaningfully better" heuristic gap check below, the same approximation the AI opponent already relies on for non-numeric chip types. */
export const PUZZLE_VARIANTS: readonly AnyVariant[] = ALL_VARIANTS;

let generatedCount = 0;

/**
 * A small, deterministic PRNG (mulberry32) — not cryptographic, just reproducible: the
 * same seed always produces the same sequence, which is the whole point of a "daily
 * puzzle" everyone gets the identical version of. `Math.random` has no seeding hook at
 * all, so a real (if minimal) PRNG is the only way to get that.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Procedurally builds a fresh tactical puzzle: random self-play from the starting
 * position for a random number of plies, then checked for one of the two tactical
 * shapes the curated `PUZZLES` above were hand-picked for (KNOWLEDGE.md) — either the
 * side to move has exactly one legal move (a forced capture chain), or several legal
 * captures from *different* chips where the best one meaningfully outscores the rest.
 * A random walk often lands on neither (game already over, or a quiet position with no
 * real choice), so this retries up to `MAX_ATTEMPTS` times and gives up with `null` --
 * PuzzleScreen falls back to a curated puzzle rather than showing nothing.
 *
 * `random` defaults to `Math.random` (every existing call site's actual behaviour,
 * unchanged) but accepts any `() => number` in `[0, 1)` — `getDailyPuzzle` below passes
 * a seeded one so the same day always regenerates the identical puzzle.
 */
export function generatePuzzle<V>(variant: Variant<V>, random: () => number = Math.random): Puzzle<V> | null {
  const MAX_ATTEMPTS = 300;
  const toNumber = toNumberFor<V>(variant.id);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const setupMoves: [Position, Position][] = [];
    let state = createGame(variant);
    const plies = 6 + Math.floor(random() * 14); // 6..19, a real midgame position
    let alive = true;
    for (let i = 0; i < plies; i++) {
      const options = legalMoves(state);
      if (options.length === 0) {
        alive = false; // the random walk itself ended the game -- start over
        break;
      }
      const pick = options[Math.floor(random() * options.length)];
      if (!pick) throw new Error('unreachable: options.length > 0 just checked');
      setupMoves.push([pick.from, pick.to]);
      state = applyMove(state, pick, variant, { checkGameOver: false });
    }
    if (!alive) continue;

    const options = legalMoves(state);
    if (options.length === 0) continue;
    const scored = options
      .map((move) => ({ move, value: applyMove(state, move, variant, { checkGameOver: false }).scores[state.turn] }))
      .sort((a, b) => variant.arithmetic.compare(b.value, a.value));
    const best = scored[0];
    if (!best) continue;
    const mover = playerLabel(state.turn);

    if (options.length === 1) {
      generatedCount += 1;
      return {
        id: `generated-${String(generatedCount)}`,
        variant,
        title: 'Find the forced move',
        setupMoves,
        solutionFrom: best.move.from,
        solutionTo: best.move.to,
        hint: `${mover} has exactly one legal move here. Find it.`,
        explanation: 'Capture is mandatory, and this was the only legal move on the board.',
      };
    }

    const runnerUp = scored.find((s) => !samePosition(s.move.from, best.move.from));
    if (!runnerUp) continue; // every legal move is from the same chip -- no real choice to puzzle over
    // A heuristic-only real-number approximation (packages/ai's own bridge for exactly
    // this "is one option meaningfully better" problem) -- never used for the puzzle's
    // displayed values, only to decide whether the gap is worth puzzling over.
    const bestNum = toNumber(best.value);
    const runnerUpNum = toNumber(runnerUp.value);
    const gap = bestNum - runnerUpNum;
    if (gap < Math.max(2, Math.abs(bestNum) * 0.15)) continue; // too close to call a "better" move

    generatedCount += 1;
    return {
      id: `generated-${String(generatedCount)}`,
      variant,
      title: 'Pick the better capture',
      setupMoves,
      solutionFrom: best.move.from,
      solutionTo: best.move.to,
      hint: `${mover} has more than one legal capture here, from different chips — compare where each one lands.`,
      explanation: `This move nets ${variant.arithmetic.format(best.value)}; the next-best legal move here only nets ${variant.arithmetic.format(runnerUp.value)}.`,
    };
  }
  return null;
}

/** UTC calendar date as a plain integer (e.g. 20260807) — UTC, not local time, so "today's puzzle" means the same calendar day for every player regardless of timezone, the same reasoning a global daily challenge (Wordle and its many descendants) always needs. Exported for `puzzles.test.ts` to check directly, not just through `getDailyPuzzle`'s own output. */
export function dailySeed(date: Date): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

/**
 * The one puzzle every player sees for a given UTC calendar day — fixed to Whole
 * Damath (the simplest variant, docs/VARIANTS.md's own build order) so it's a single
 * shared challenge to compare notes on, not one that varies by which variant happens
 * to be selected. Deterministic: the same `date` (to the day) always regenerates the
 * identical puzzle, since `generatePuzzle` only ever draws from the seeded `random` --
 * verified in puzzles.test.ts by calling this twice for the same day and diffing the
 * result. Falls back to a curated puzzle (keyed off the same seed, so it's still
 * stable per day) in the astronomically unlikely case `generatePuzzle` exhausts its
 * attempts.
 */
export function getDailyPuzzle(date: Date = new Date()): Puzzle<number> {
  const seed = dailySeed(date);
  const puzzle = generatePuzzle(WHOLE_DAMATH, mulberry32(seed));
  if (puzzle) return { ...puzzle, id: `daily-${String(seed)}` };
  const fallback = PUZZLES[seed % PUZZLES.length];
  if (!fallback) throw new Error('unreachable: PUZZLES is a fixed non-empty constant');
  return { ...fallback, id: `daily-${String(seed)}` };
}

export type { Player };
