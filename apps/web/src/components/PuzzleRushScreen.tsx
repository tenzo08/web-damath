import { useEffect, useRef, useState } from 'react';
import { applyMove, operationAt, pieceAt } from '@damath/engine';
import type { AnyVariant, GameState, Position, Variant, VariantId } from '@damath/engine';
import { MiniBoard, type MiniSquareSpec } from './diagram/MiniBoard';
import { PUZZLE_VARIANTS, findLegalMove, generatePuzzle, puzzleStartState, type Puzzle } from '../lib/puzzles';
import { isPlayable } from '../lib/board';
import { operationGlyph, playerLabel } from '../lib/notation';
import { useSettings } from '../lib/settings';
import { playCaptureSound, playErrorSound, playLossSound, playWinSound } from '../lib/sound';

interface PuzzleRushScreenProps {
  onBackToPuzzles: () => void;
}

type ValueOf<T> = T extends Variant<infer V> ? V : never;
type AnyPuzzleValue = ValueOf<AnyVariant>;

const DURATIONS = [
  { seconds: 60, label: '60 seconds' },
  { seconds: 180, label: '3 minutes' },
] as const;

const BEST_KEY_PREFIX = 'damath.puzzleRush.best.';
function bestScoreFor(seconds: number): number {
  try {
    return Number(localStorage.getItem(`${BEST_KEY_PREFIX}${String(seconds)}`) ?? 0);
  } catch {
    return 0;
  }
}
function saveBestScoreFor(seconds: number, score: number): void {
  try {
    localStorage.setItem(`${BEST_KEY_PREFIX}${String(seconds)}`, String(score));
  } catch {
    // Best-effort — a lost personal-best record on a private-browsing tab is a fine degradation.
  }
}

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

/** Mirrors PuzzleScreen.tsx's own buildRows exactly — kept as a separate copy rather than a shared import since the two screens' state shapes (single puzzle vs. a timed run) have diverged enough that sharing would mean threading unrelated concerns through one signature; see KISS in coding-style.md. */
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

type Phase = 'setup' | 'playing' | 'over';

/**
 * Puzzle Rush — solve as many generated puzzles as possible before the clock runs out
 * ("60s/3min... adds a genuinely replayable, competitive loop distinct from a match").
 * Pure reuse of `generatePuzzle` for an unlimited supply; unlike PuzzleScreen's own
 * untimed practice mode (unlimited retries on a wrong guess), a single incorrect move
 * here ends the run immediately — the standard "Puzzle Rush" convention this feature is
 * named after, and the reason a fast clock is a meaningful skill signal rather than
 * something you could beat by spamming guesses.
 */
export function PuzzleRushScreen({ onBackToPuzzles }: PuzzleRushScreenProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [durationSec, setDurationSec] = useState<number>(60);
  const [variantId, setVariantId] = useState<VariantId>(PUZZLE_VARIANTS[0]?.id ?? 'whole');
  const [secondsLeft, setSecondsLeft] = useState(durationSec);
  const [score, setScore] = useState(0);
  const [puzzle, setPuzzle] = useState<Puzzle<AnyPuzzleValue> | null>(null);
  const [state, setState] = useState<GameState<AnyPuzzleValue> | null>(null);
  const [selected, setSelected] = useState<Position | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const { effectiveVolume } = useSettings();
  const best = bestScoreFor(durationSec);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Runs the moment the clock actually hits zero, not just on the 0 render -- separate
  // from the interval effect above so ending the run is a plain state transition, not
  // logic buried inside setSecondsLeft's updater.
  const endedRef = useRef(false);
  useEffect(() => {
    if (phase === 'playing' && secondsLeft === 0 && !endedRef.current) {
      endedRef.current = true;
      setPhase('over');
      playLossSound(effectiveVolume);
      if (score > best) saveBestScoreFor(durationSec, score);
    }
  }, [phase, secondsLeft, score, best, durationSec, effectiveVolume]);

  function loadNextPuzzle(): boolean {
    const variant = PUZZLE_VARIANTS.find((v) => v.id === variantId) ?? PUZZLE_VARIANTS[0];
    if (!variant) return false;
    const next = generatePuzzle<AnyPuzzleValue>(variant);
    if (!next) {
      setGenError("Couldn't generate the next puzzle — ending the run early.");
      return false;
    }
    setPuzzle(next);
    setState(puzzleStartState(next));
    setSelected(null);
    return true;
  }

  function start() {
    endedRef.current = false;
    setGenError(null);
    setScore(0);
    setSecondsLeft(durationSec);
    if (!loadNextPuzzle()) return;
    setPhase('playing');
  }

  function endRun() {
    endedRef.current = true;
    setPhase('over');
    playLossSound(effectiveVolume);
    if (score > best) saveBestScoreFor(durationSec, score);
  }

  function activate(pos: Position) {
    if (phase !== 'playing' || !puzzle || !state) return;
    const piece = pieceAt(state.board, pos);
    if (selected) {
      if (piece && piece.owner === state.turn) {
        setSelected(pos);
        return;
      }
      const move = findLegalMove(state, selected, pos);
      setSelected(null);
      const isSolution = move && samePosition(move.from, puzzle.solutionFrom) && samePosition(move.to, puzzle.solutionTo);
      if (!isSolution) {
        playErrorSound(effectiveVolume);
        endRun();
        return;
      }
      const nextState = applyMove(state, move, puzzle.variant, { checkGameOver: false });
      setState(nextState);
      setScore((s) => s + 1);
      if (move.captures.length > 0) playCaptureSound(effectiveVolume);
      else playWinSound(effectiveVolume);
      // A short beat so the solved position is actually visible before the next puzzle
      // replaces it — an instant swap reads as nothing happened.
      setTimeout(() => {
        if (!loadNextPuzzle()) endRun();
      }, 250);
      return;
    }
    if (piece && piece.owner === state.turn) setSelected(pos);
  }

  const flipped = state ? state.turn === 'black' : false;
  const rows = state && puzzle ? buildRows(state, puzzle.variant, selected, flipped, activate) : [];
  const isNewBest = phase === 'over' && score > best;

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(1400px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button type="button" onClick={onBackToPuzzles} style={secondaryButton}>
            ← Puzzles
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>🏃 Puzzle Rush</h1>
        </header>

        {phase === 'setup' && (
          <div style={{ ...cardStyle, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>Duration</span>
              <select value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} style={{ ...secondaryButton, cursor: 'pointer' }}>
                {DURATIONS.map((d) => (
                  <option key={d.seconds} value={d.seconds}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>Variant</span>
              <select value={variantId} onChange={(e) => setVariantId(e.target.value as VariantId)} style={{ ...secondaryButton, cursor: 'pointer' }}>
                {PUZZLE_VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
              Solve as many puzzles as you can before time runs out. One wrong move ends the run — best: {best}.
            </p>
            <button type="button" onClick={start} style={primaryButton}>
              Start
            </button>
          </div>
        )}

        {phase === 'playing' && state && puzzle && (
          <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
            <div style={{ flex: '2 1 380px', maxWidth: 560, minWidth: 260, width: '100%', display: 'flex', justifyContent: 'center' }}>
              <MiniBoard rows={rows} size="min(560px, 58vh, 100%)" label={`${puzzle.variant.name} · ${playerLabel(state.turn)} to move`} />
            </div>
            <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
              <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 'var(--fs-display)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{secondsLeft}s</span>
                <span style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--accent)' }}>Score: {score}</span>
              </div>
              <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>Select a piece, then a destination.</p>
            </div>
          </div>
        )}

        {phase === 'over' && (
          <div style={{ ...cardStyle, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <p style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--accent)' }}>Time's up!</p>
            <p style={{ margin: 0, fontSize: 'var(--fs-body)' }}>
              You solved <strong>{score}</strong> {score === 1 ? 'puzzle' : 'puzzles'}
              {isNewBest ? ' — a new best! 🎉' : ` (best: ${String(Math.max(score, best))})`}.
            </p>
            {genError && (
              <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
                {genError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
              <button type="button" onClick={start} style={primaryButton}>
                Play again
              </button>
              <button type="button" onClick={onBackToPuzzles} style={secondaryButton}>
                Back to Puzzles
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
