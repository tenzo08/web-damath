import { useMemo, useState } from 'react';
import { ALL_VARIANTS, operationAt, pieceAt, replayMoves } from '@damath/engine';
import type { Move, Position, Variant, VariantId } from '@damath/engine';
import { MiniBoard, type MiniArrowSpec, type MiniSquareSpec } from './diagram/MiniBoard';
import { isPlayable } from '../lib/board';
import { operationGlyph, playerLabel } from '../lib/notation';
import { useGameReview } from '../hooks/useGameReview';
import type { MoveClassification, PlyReview } from '../lib/gameReview';

interface GameReviewScreenProps {
  variantId: VariantId;
  /** Genuine `Move<V>` values, untyped here for the same JSON-boundary reason OnlineGameScreen's own moveHistory prop is — see that file's doc comment. */
  moveHistory: readonly unknown[];
  onBackToLobby: () => void;
}

type ValueOf<T> = T extends Variant<infer V> ? V : never;
type AnyValue = ValueOf<(typeof ALL_VARIANTS)[number]>;

function findVariant(variantId: VariantId): Variant<AnyValue> | null {
  return (ALL_VARIANTS.find((v) => v.id === variantId) as Variant<AnyValue> | undefined) ?? null;
}

const CLASSIFICATION_META: Record<MoveClassification, { label: string; color: string; icon: string }> = {
  best: { label: 'Best', color: 'var(--success, #3fb950)', icon: '★' },
  excellent: { label: 'Excellent', color: 'var(--success, #3fb950)', icon: '✓' },
  good: { label: 'Good', color: 'var(--info, #7fa6c9)', icon: '·' },
  inaccuracy: { label: 'Inaccuracy', color: 'var(--accent)', icon: '?!' },
  mistake: { label: 'Mistake', color: 'var(--danger)', icon: '?' },
  blunder: { label: 'Blunder', color: 'var(--danger)', icon: '??' },
};

function squareName(pos: Position): string {
  return `${String.fromCharCode(97 + pos.col)}${String(pos.row + 1)}`;
}

/** Mirrors PuzzleScreen.tsx's own buildRows exactly (read-only here — no onActivate, this is a replay, not a puzzle to solve). See PuzzleRushScreen.tsx's identical doc comment for why this is a small separate copy rather than a shared import. */
function buildRows<V>(state: ReturnType<typeof replayMoves<V>>, variant: Variant<V>, flipped: boolean): (MiniSquareSpec | null)[][] {
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
        highlight: null,
      });
    }
    rows.push(cols);
  }
  return rows;
}

const cardStyle = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--pad-xl)',
} as const;

const secondaryButton = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-secondary)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  cursor: 'pointer',
} as const;

/**
 * Post-game AI review — chess.com's "Game Review," built on the existing packages/ai
 * engine rather than a new one: for every ply, `useGameReview` asks the engine's own
 * search "what was the best move here?" and classifies how far the move actually played
 * fell short. Works for both local and online games — either caller just hands over a
 * variant id and a finished game's move history.
 */
export function GameReviewScreen({ variantId, moveHistory, onBackToLobby }: GameReviewScreenProps) {
  const variant = findVariant(variantId);
  const fallbackVariant = findVariant('whole');
  if (!fallbackVariant) throw new Error('unreachable: ALL_VARIANTS always includes Whole Damath');
  const typedMoveHistory = useMemo(() => moveHistory as Move<AnyValue>[], [moveHistory]);
  // `useGameReview` (a hook) must run unconditionally on every render, before the `!variant`
  // early return below -- when `variant` is genuinely invalid, this analyzes a harmless
  // placeholder (Whole Damath) whose result is simply never rendered.
  const { reviews, analyzing, error, total } = useGameReview(variant ?? fallbackVariant, typedMoveHistory);
  // `null` means "show the final position" -- the natural default once the review has
  // (or is still) loading in ply by ply.
  const [selectedPly, setSelectedPly] = useState<number | null>(null);

  if (!variant) {
    return (
      <main style={{ flex: 1, padding: 'var(--pad-xl)' }}>
        <p role="alert" style={{ color: 'var(--danger)' }}>
          Unknown variant "{variantId}" — can't review this game.
        </p>
      </main>
    );
  }

  const activePly = selectedPly ?? reviews.length;
  const boardState = replayMoves(variant, typedMoveHistory.slice(0, activePly));
  const flipped = boardState.turn === 'black';
  const currentReview: PlyReview<AnyValue> | undefined = activePly > 0 ? reviews[activePly - 1] : undefined;

  const arrows: MiniArrowSpec[] =
    currentReview && !currentReview.isBest
      ? [
          {
            from: currentReview.bestMove.from,
            to: currentReview.bestMove.to,
            kind: currentReview.bestMove.captures.length > 0 ? 'capture' : 'move',
          },
        ]
      : [];

  const rows = buildRows(boardState, variant, flipped);

  const counts = reviews.reduce<Record<MoveClassification, number>>(
    (acc, r) => ({ ...acc, [r.classification]: acc[r.classification] + 1 }),
    { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
  );
  const accuracy = reviews.length > 0 ? Math.round(((counts.best + counts.excellent) / reviews.length) * 100) : null;

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(1400px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)', flexWrap: 'wrap' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← Lobby
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Game Review</h1>
          {accuracy !== null && (
            <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
              Accuracy so far: <strong style={{ color: 'var(--accent)' }}>{accuracy}%</strong>
            </span>
          )}
        </header>

        <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div style={{ flex: '2 1 380px', maxWidth: 560, minWidth: 260, width: '100%', display: 'flex', justifyContent: 'center' }}>
            <MiniBoard
              rows={rows}
              size="min(560px, 58vh, 100%)"
              arrows={arrows}
              label={`${variant.name} · ${activePly === 0 ? 'Starting position' : `after ply ${String(activePly)}`}`}
            />
          </div>

          <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <div style={cardStyle}>
              {analyzing && !error && (
                <p style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                  Analyzing move {reviews.length} of {total}…
                </p>
              )}
              {error && (
                <p role="alert" style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
                  {error} {reviews.length > 0 ? `Showing the ${reviews.length} move(s) analyzed so far.` : ''}
                </p>
              )}
              {currentReview ? (
                <>
                  <p style={{ margin: 0, fontSize: 'var(--fs-label)', fontWeight: 700, color: CLASSIFICATION_META[currentReview.classification].color }}>
                    {CLASSIFICATION_META[currentReview.classification].icon} {CLASSIFICATION_META[currentReview.classification].label}
                  </p>
                  <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                    {playerLabel(currentReview.mover)} played {squareName(currentReview.playedMove.from)}→{squareName(currentReview.playedMove.to)}
                    {!currentReview.isBest && (
                      <>
                        {' '}
                        — the engine's best was {squareName(currentReview.bestMove.from)}→{squareName(currentReview.bestMove.to)} (Δ{' '}
                        {currentReview.delta.toFixed(1)}).
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>Starting position.</p>
              )}
            </div>

            <div style={{ ...cardStyle, maxHeight: 360, overflowY: 'auto' }} className="scroll-hidden">
              <h2 style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Moves
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  type="button"
                  onClick={() => setSelectedPly(0)}
                  style={{
                    textAlign: 'left',
                    background: activePly === 0 ? 'var(--accent-bg)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    padding: 'var(--pad-sm)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Starting position
                </button>
                {reviews.map((r) => {
                  const meta = CLASSIFICATION_META[r.classification];
                  const isActive = activePly === r.ply;
                  return (
                    <button
                      key={r.ply}
                      type="button"
                      onClick={() => setSelectedPly(r.ply)}
                      aria-label={`Ply ${String(r.ply)}, ${playerLabel(r.mover)} ${squareName(r.playedMove.from)} to ${squareName(r.playedMove.to)}, ${meta.label}`}
                      style={{
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 'var(--gap-sm)',
                        background: isActive ? 'var(--accent-bg)' : 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        padding: 'var(--pad-sm)',
                        color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 'var(--fs-meta)',
                      }}
                    >
                      <span aria-hidden="true">
                        {r.ply}. {playerLabel(r.mover)} {squareName(r.playedMove.from)}→{squareName(r.playedMove.to)}
                      </span>
                      <span aria-hidden="true" style={{ color: meta.color, fontWeight: 700 }}>
                        {meta.icon}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {!analyzing && reviews.length > 0 && (
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)' }}>
                {(Object.keys(CLASSIFICATION_META) as MoveClassification[]).map((c) => (
                  <div key={c} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: CLASSIFICATION_META[c].color }}>
                      {CLASSIFICATION_META[c].icon} {CLASSIFICATION_META[c].label}
                    </span>
                    <span>{counts[c]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
