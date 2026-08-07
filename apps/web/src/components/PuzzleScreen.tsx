import { useEffect, useState } from 'react';
import { applyMove, operationAt, pieceAt } from '@damath/engine';
import type { GameState, Position, Variant, VariantId } from '@damath/engine';
import { MiniBoard, type MiniSquareSpec } from './diagram/MiniBoard';
import { PUZZLES, PUZZLE_VARIANTS, findLegalMove, generatePuzzle, puzzleSolvedState, puzzleStartState, type Puzzle } from '../lib/puzzles';
import { isPlayable } from '../lib/board';
import { operationGlyph, playerLabel } from '../lib/notation';
import { useSettings } from '../lib/settings';
import { playCaptureSound, playErrorSound, playWinSound } from '../lib/sound';

interface PuzzleScreenProps {
  onBackToLobby: () => void;
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

/** `goTo` always wraps its argument into [0, PUZZLES.length) via modulo, so an out-of-range index here is a real bug, not a case to degrade gracefully from. */
function puzzleAt(index: number): Puzzle {
  const puzzle = PUZZLES[index];
  if (!puzzle) throw new Error(`unreachable: puzzle index ${String(index)} out of range`);
  return puzzle;
}

function buildRows(
  state: GameState<number>,
  variant: Variant<number>,
  selected: Position | null,
  onActivate: (pos: Position) => void,
): (MiniSquareSpec | null)[][] {
  const rows: (MiniSquareSpec | null)[][] = [];
  for (let row = 0; row < 8; row++) {
    const cols: (MiniSquareSpec | null)[] = [];
    for (let col = 0; col < 8; col++) {
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
export function PuzzleScreen({ onBackToLobby }: PuzzleScreenProps) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'curated' | 'generated'>('curated');
  const [generated, setGenerated] = useState<Puzzle | null>(null);
  const [genVariantId, setGenVariantId] = useState<VariantId>(PUZZLE_VARIANTS[0]?.id ?? 'whole');
  const [genError, setGenError] = useState<string | null>(null);
  const puzzle = mode === 'generated' && generated ? generated : puzzleAt(index);

  const [state, setState] = useState<GameState<number>>(() => puzzleStartState(puzzle));
  const [selected, setSelected] = useState<Position | null>(null);
  const [status, setStatus] = useState<'playing' | 'solved' | 'revealed'>('playing');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const { effectiveVolume } = useSettings();

  useEffect(() => {
    setState(puzzleStartState(puzzle));
    setSelected(null);
    setStatus('playing');
    setFeedback(null);
    setShowHint(false);
  }, [puzzle]);

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

  function generateNew() {
    const variant = PUZZLE_VARIANTS.find((v) => v.id === genVariantId) ?? PUZZLE_VARIANTS[0];
    if (!variant) return; // unreachable -- PUZZLE_VARIANTS is a fixed non-empty constant
    const next = generatePuzzle(variant);
    if (!next) {
      setGenError("Couldn't find a fresh tactical position that time — try again.");
      return;
    }
    setGenError(null);
    setGenerated(next);
    setMode('generated');
  }

  const rows = buildRows(state, puzzle.variant, selected, activate);

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(1400px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← Lobby
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Puzzles</h1>
        </header>

        <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div style={{ flex: '3 1 480px', maxWidth: 760, minWidth: 280, width: '100%', display: 'flex', justifyContent: 'center' }}>
            <MiniBoard rows={rows} size={760} label={`${puzzle.variant.name} · ${playerLabel(state.turn)} to move`} />
          </div>

          <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <div style={cardStyle}>
              <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                {mode === 'curated' ? `Puzzle ${index + 1} of ${PUZZLES.length}` : `Generated puzzle · ${puzzle.variant.name}`}
              </p>
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
              {mode === 'generated' && (
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
