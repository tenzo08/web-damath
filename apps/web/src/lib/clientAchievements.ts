/**
 * The one achievement this app can't compute server-side (achievements/compute.ts's
 * others all derive from GameStore, which only ever knows about *online* games) —
 * puzzles are entirely client-side, with no server-side puzzle-solve tracking at all.
 * Same best-effort localStorage pattern PuzzleScreen.tsx's own daily-puzzle-solved flag
 * already uses (try/catch: localStorage throws in some private-browsing modes, and "can't
 * remember you solved one" is a fine degradation, not worth surfacing an error over).
 */
const FIRST_PUZZLE_SOLVED_KEY = 'damath.achievements.firstPuzzleSolved';

export function markFirstPuzzleSolved(): void {
  try {
    localStorage.setItem(FIRST_PUZZLE_SOLVED_KEY, 'true');
  } catch {
    // Best-effort — see the module doc comment.
  }
}

export function hasSolvedFirstPuzzle(): boolean {
  try {
    return localStorage.getItem(FIRST_PUZZLE_SOLVED_KEY) === 'true';
  } catch {
    return false;
  }
}
