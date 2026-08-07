import { useMemo, useState } from 'react';
import { applyMove, operationAt, pieceAt } from '@damath/engine';
import type { AnyVariant, GameState, Position, Variant, VariantId } from '@damath/engine';
import { MiniBoard, type MiniSquareSpec } from './diagram/MiniBoard';
import {
  PUZZLES,
  PUZZLE_VARIANTS,
  findLegalMove,
  generatePuzzle,
  getDailyPuzzle,
  legalSolutionMove,
  puzzleSolvedState,
  puzzleStartState,
  type Puzzle,
} from '../lib/puzzles';
import { isPlayable } from '../lib/board';
import { operationGlyph, playerLabel } from '../lib/notation';
import { useSettings } from '../lib/settings';
import { playCaptureSound, playErrorSound, playWinSound } from '../lib/sound';
import { markFirstPuzzleSolved } from '../lib/clientAchievements';

interface PuzzleScreenProps {
  onBackToLobby: () => void;
  onPuzzleRush: () => void;
}

/** Distributes over the `AnyVariant` union to recover "every chip value type any variant uses" — same trick App.tsx's `GameShell` call site already relies on, needed here because a generated puzzle's variant (and so its chip value type `V`) can change at runtime as the player picks a different one to generate from. */
type ValueOf<T> = T extends Variant<infer V> ? V : never;
type AnyPuzzleValue = ValueOf<AnyVariant>;

const cardStyle = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--pad-xl)',
} as const;

const primaryButton = {
  background: 'var(--accent)',
  color: 'var(--accent-on)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const secondaryButton = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-secondary)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  cursor: 'pointer',
} as const;

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

// Just the *last* solved daily puzzle's id (e.g. "daily-20260807") — enough to answer
// "is today's specifically solved", since a new day means a new id and the old one no
// longer matches, no separate date comparison needed. `try/catch`: localStorage throws
// in some private-browsing modes, and "can't remember you solved it" is a fine
// degradation, not worth surfacing an error over.
const DAILY_SOLVED_KEY = 'damath.dailyPuzzle.solved';
function isDailySolved(puzzleId: string): boolean {
  try {
    return localStorage.getItem(DAILY_SOLVED_KEY) === puzzleId;
  } catch {
    return false;
  }
}
function markDailySolved(puzzleId: string): void {
  try {
    localStorage.setItem(DAILY_SOLVED_KEY, puzzleId);
  } catch {
    // Best-effort — see isDailySolved's comment.
  }
}

/** `goTo` always wraps its argument into [0, PUZZLES.length) via modulo, so an out-of-range index here is a real bug, not a case to degrade gracefully from. */
function puzzleAt(index: number): Puzzle<AnyPuzzleValue> {
  const puzzle = PUZZLES[index];
  if (!puzzle) throw new Error(`unreachable: puzzle index ${String(index)} out of range`);
  return puzzle;
}

/**
 * `flipped` mirrors Board.tsx's own convention exactly: not flipped renders row 7 at
 * the top and row 0 (White's home) at the bottom; flipped renders row 0 at the top and
 * row 7 (Dark's home) at the bottom. Puzzles pass `flipped = turn === 'black'` so
 * whichever side is actually on the move is always the one nearest the reader, the
 * same "your turn, your side is at the bottom" convention the real game screens use.
 */
function buildRows<V>(
  state: GameState<V>,
  variant: Variant<V>,
  selected: Position | null,
  flipped: boolean,
  onActivate: (pos: Position) => void,
): (MiniSquareSpec | null)[][] {
  const rowOrder = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const colOrder = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const rows: (MiniSquareSpec | null)[][] = [];
  for (const row of rowOrder) {
    const cols: (MiniSquareSpec | null)[] = [];
    for (const col of colOrder) {
      const pos: Position = { row, col };
      if (!isPlayable(pos)) {
        cols.push({ playable: false });
        continue;
      }
      const piece = pieceAt(state.board, pos);
      cols.push({
        operation: operationGlyph(operationAt(pos)) as '+' | '−' | '×' | '÷',
        piece: piece ? { owner: piece.owner, isDama: piece.isDama, label: variant.arithmetic.format(piece.value) } : null,
        highlight: selected && samePosition(selected, pos) ? 'selected' : null,
        onActivate: () => onActivate(pos),
      });
    }
    rows.push(cols);
  }
  return rows;
}

/**
 * Curated capture-chain / find-the-winning-move positions (chess.com-inspired
 * suggestion #3, TASK.md), reusing MiniBoard the way the request specified. Every
 * curated puzzle's starting position and solution come from `lib/puzzles.ts`, mined by
 * actually running the engine forward from a real game rather than hand-typed --
 * `puzzles.test.ts` asserts every one of them is still a legal, reachable position
 * whose marked solution is a real legal move there. A "Generate new puzzle" mode sits
 * alongside it, procedurally building an unlimited supply of the same two tactical
 * shapes (`generatePuzzle`) for whichever of the three number-typed variants is picked.
 */
export function PuzzleScreen({ onBackToLobby, onPuzzleRush }: PuzzleScreenProps) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'curated' | 'generated' | 'daily'>('curated');
  const [generated, setGenerated] = useState<Puzzle<AnyPuzzleValue> | null>(null);
  const [genVariantId, setGenVariantId] = useState<VariantId>(PUZZLE_VARIANTS[0]?.id ?? 'whole');
  const [genError, setGenError] = useState<string | null>(null);
  // Computed once per visit, not re-rolled on every render — `getDailyPuzzle` is
  // deterministic for a given UTC day, but still does real work (up to 300 attempts
  // of simulated self-play) to get there.
  const dailyPuzzle = useMemo(() => getDailyPuzzle(), []);
  const puzzle = mode === 'daily' ? dailyPuzzle : mode === 'generated' && generated ? generated : puzzleAt(index);

  const [state, setState] = useState<GameState<AnyPuzzleValue>>(() => puzzleStartState(puzzle));
  const [selected, setSelected] = useState<Position | null>(null);
  const [status, setStatus] = useState<'playing' | 'solved' | 'revealed'>('playing');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const { effectiveVolume } = useSettings();

  // Resets `state` (and the rest of this puzzle's play state) the moment `puzzle`
  // itself changes, synchronously during render rather than in a `useEffect` --
  // React's own documented pattern for "adjusting state when a prop changes"
  // (https://react.dev/learn/you-might-not-need-an-effect). Calling `setState`
  // here only *schedules* the update; this render's own `state` binding is still
  // the previous puzzle's board, so `effectiveState` (used below in place of
  // `state` for the rest of *this* render) is what actually prevents passing a
  // stale board together with the new puzzle's `variant` to `buildRows` --
  // harmless when every puzzle variant shared the same `number` value shape, but
  // a hard crash once a puzzle could switch to a structurally different chip
  // type (e.g. Polynomial's array-based `format` fed the old puzzle's plain
  // numbers), found by actually generating a Polynomial puzzle from a numeric one.
  const [puzzleForState, setPuzzleForState] = useState(puzzle);
  let effectiveState = state;
  if (puzzleForState !== puzzle) {
    setPuzzleForState(puzzle);
    effectiveState = puzzleStartState(puzzle);
    setState(effectiveState);
    setSelected(null);
    setStatus('playing');
    setFeedback(null);
    setShowHint(false);
  }

  function activate(pos: Position) {
    if (status !== 'playing') return;
    const piece = pieceAt(state.board, pos);
    if (selected) {
      if (piece && piece.owner === state.turn) {
        setSelected(pos);
        return;
      }
      const move = findLegalMove(state, selected, pos);
      setSelected(null);
      if (!move) {
        setFeedback("That's not a legal move here.");
        playErrorSound(effectiveVolume);
        return;
      }
      const isSolution = samePosition(move.from, puzzle.solutionFrom) && samePosition(move.to, puzzle.solutionTo);
      if (isSolution) {
        setState(applyMove(state, move, puzzle.variant));
        setStatus('solved');
        setFeedback(null);
        if (mode === 'daily') markDailySolved(puzzle.id);
        markFirstPuzzleSolved();
        if (move.captures.length > 0) playCaptureSound(effectiveVolume);
        else playWinSound(effectiveVolume);
      } else {
        setFeedback("That's a legal move, but not the best one here — try again.");
        playErrorSound(effectiveVolume);
      }
      return;
    }
    if (piece && piece.owner === state.turn) setSelected(pos);
  }

  function reveal() {
    setState(puzzleSolvedState(puzzle));
    setStatus('revealed');
    setSelected(null);
    setFeedback(null);
  }

  function goTo(newIndex: number) {
    setMode('curated');
    setIndex(((newIndex % PUZZLES.length) + PUZZLES.length) % PUZZLES.length);
  }

  function goToDaily() {
    setMode('daily');
  }

  function generateNew() {
    const variant = PUZZLE_VARIANTS.find((v) => v.id === genVariantId) ?? PUZZLE_VARIANTS[0];
    if (!variant) return; // unreachable -- PUZZLE_VARIANTS is a fixed non-empty constant
    const next = generatePuzzle<AnyPuzzleValue>(variant);
    if (!next) {
      setGenError("Couldn't find a fresh tactical position that time — try again.");
      return;
    }
    setGenError(null);
    setGenerated(next);
    setMode('generated');
  }

  // The player to move is always the one nearest the reader, same convention the real
  // game screens use — see buildRows's own doc comment for the exact row/col mapping.
  const flipped = effectiveState.turn === 'black';
  const rows = buildRows(effectiveState, puzzle.variant, selected, flipped, activate);

  // "Number of moves needed" (docs request) — every puzzle here is, by construction, a
  // single-turn "find the winning move" position (lib/puzzles.ts: a forced chain, or
  // picking the best of several legal captures), so this is always 1 turn even when
  // that turn is itself a multi-jump capture chain — which is called out separately
  // (docs/DAMATH_RULES.md §"a whole chain of jumps counts as a single turn") rather
  // than counted as extra "moves," to avoid overstating what the puzzle actually asks.
  const solutionMove = useMemo(() => legalSolutionMove(puzzle), [puzzle]);
  const jumpCount = solutionMove?.captures.length ?? 0;

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(1400px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)', flexWrap: 'wrap' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← Lobby
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Puzzles</h1>
          <div style={{ display: 'flex', gap: 'var(--gap-sm)', marginLeft: 'auto' }}>
            <button type="button" onClick={onPuzzleRush} style={secondaryButton}>
              🏃 Puzzle Rush
            </button>
            <button type="button" onClick={goToDaily} style={mode === 'daily' ? primaryButton : secondaryButton}>
              ⭐ Today's Puzzle{isDailySolved(dailyPuzzle.id) ? ' ✓' : ''}
            </button>
          </div>
        </header>

        <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div style={{ flex: '2 1 380px', maxWidth: 560, minWidth: 260, width: '100%', display: 'flex', justifyContent: 'center' }}>
            {/* Same viewport-height-aware cap as the real game board (Board.tsx,
                OnlineBoard.tsx) — matches size across every board in the app instead
                of puzzles alone running taller than the viewport. */}
            <MiniBoard rows={rows} size="min(560px, 58vh, 100%)" label={`${puzzle.variant.name} · ${playerLabel(effectiveState.turn)} to move`} />
          </div>

          <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <div style={cardStyle}>
              <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                {mode === 'daily'
                  ? `Today's Puzzle · ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
                  : mode === 'curated'
                    ? `Puzzle ${index + 1} of ${PUZZLES.length}`
                    : `Generated puzzle · ${puzzle.variant.name}`}
                {mode === 'daily' && isDailySolved(dailyPuzzle.id) && (
                  <span style={{ color: 'var(--success, #3fb950)' }}> · already solved today</span>
                )}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', margin: 'var(--pad-sm) 0 0 0' }}>
                <span
                  style={{
                    fontSize: 'var(--fs-micro)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: 'var(--accent)',
                    background: 'var(--accent-bg)',
                    borderRadius: 'var(--radius)',
                    padding: '2px 8px',
                  }}
                >
                  {playerLabel(effectiveState.turn)} to move
                </span>
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                  {jumpCount > 1 ? `1 move — a ${String(jumpCount)}-jump capture` : '1 move to solve'}
                </span>
              </div>
              <h2 style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-label)' }}>{puzzle.title}</h2>

              {status === 'playing' && (
                <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                  Select a piece, then a destination.
                </p>
              )}
              {feedback && (
                <p role="alert" style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
                  {feedback}
                </p>
              )}
              {showHint && status === 'playing' && (
                <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--accent)' }}>{puzzle.hint}</p>
              )}
              {status === 'solved' && (
                <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--success, #3fb950)' }}>
                  Solved! {puzzle.explanation}
                </p>
              )}
              {status === 'revealed' && (
                <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>{puzzle.explanation}</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 'var(--gap-sm)', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setShowHint(true)} disabled={showHint || status !== 'playing'} style={secondaryButton}>
                Hint
              </button>
              <button type="button" onClick={reveal} disabled={status !== 'playing'} style={secondaryButton}>
                Show solution
              </button>
            </div>

            <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
              <button type="button" onClick={() => goTo(index - 1)} style={secondaryButton}>
                ◂ Previous
              </button>
              <button type="button" onClick={() => goTo(index + 1)} style={primaryButton}>
                Next puzzle ▸
              </button>
            </div>

            <div style={{ ...cardStyle, padding: 'var(--pad-md)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Generate a new puzzle
              </h3>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>Variant</span>
                <select
                  value={genVariantId}
                  onChange={(e) => setGenVariantId(e.target.value as VariantId)}
                  style={{ ...secondaryButton, cursor: 'pointer' }}
                >
                  {PUZZLE_VARIANTS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={generateNew} style={primaryButton}>
                Generate new puzzle
              </button>
              {genError && (
                <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
                  {genError}
                </p>
              )}
              {mode !== 'curated' && (
                <button type="button" onClick={() => goTo(index)} style={secondaryButton}>
                  ← Back to curated puzzles
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
