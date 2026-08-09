import { useMemo, useState } from 'react';
import { ALL_VARIANTS, operationAt, pieceAt, replayMoves } from '@damath/engine';
import type { Move, Player, Position, Variant, VariantId } from '@damath/engine';
import { MiniBoard, type MiniArrowSpec, type MiniSquareSpec } from './diagram/MiniBoard';
import { isPlayable, samePosition } from '../lib/board';
import { operationGlyph, playerLabel } from '../lib/notation';
import { useGameReview } from '../hooks/useGameReview';
import { plyAccuracy, type MoveClassification, type PlyReview } from '../lib/gameReview';

interface GameReviewScreenProps {
  variantId: VariantId;
  /** Genuine `Move<V>` values, untyped here for the same JSON-boundary reason OnlineGameScreen's own moveHistory prop is — see that file's doc comment. */
  moveHistory: readonly unknown[];
  /**
   * Whose side the board stays oriented to for the *whole* review — the reviewer is
   * one specific person looking back at a finished game, not both players sharing a
   * screen, so the board must not keep auto-flipping to whichever side is on move the
   * way local pass-and-play's live board does (that reads as "the board is flipping,"
   * a real bug report, not a feature). Defaults to `'white'` when the caller has no
   * single obvious reviewer to name (local friend mode, or a spectator).
   */
  perspective?: Player;
  onBackToLobby: () => void;
  /**
   * "Practice this position" — hands the position just *before* a reviewed mistake
   * back to the caller (App.tsx's `enterPractice`) along with which side made it, to
   * start a fresh vs-computer match retrying that exact decision. Optional: a caller
   * with nowhere to send this (none today, but the type doesn't assume one exists)
   * simply doesn't get the button.
   */
  onPracticePosition?: (variantId: VariantId, moveHistory: readonly unknown[], mover: Player) => void;
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

interface ReviewRound<V> {
  round: number;
  white: PlyReview<V> | null;
  black: PlyReview<V> | null;
}

/** Same pairing as MoveLedger.tsx's `buildRounds` — `reviewPly` reviews every ply in order, and the engine always alternates white/black starting with white, so index parity alone tells the two sides apart. */
function buildReviewRounds<V>(reviews: readonly PlyReview<V>[]): ReviewRound<V>[] {
  const rounds: ReviewRound<V>[] = [];
  for (let i = 0; i < reviews.length; i += 2) {
    rounds.push({ round: rounds.length + 1, white: reviews[i] ?? null, black: reviews[i + 1] ?? null });
  }
  return rounds;
}

function ReviewCell<V>({ review, isActive, onSelect }: { review: PlyReview<V> | null; isActive: boolean; onSelect: (ply: number) => void }) {
  if (!review) return <span style={{ flex: 1 }} />;
  const meta = CLASSIFICATION_META[review.classification];
  return (
    <button
      type="button"
      onClick={() => onSelect(review.ply)}
      aria-label={`Ply ${String(review.ply)}, ${playerLabel(review.mover)} ${squareName(review.playedMove.from)} to ${squareName(review.playedMove.to)}, ${meta.label}`}
      style={{
        textAlign: 'left',
        display: 'flex',
        flex: 1,
        minWidth: 0,
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
      <span aria-hidden="true" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {squareName(review.playedMove.from)}→{squareName(review.playedMove.to)}
      </span>
      <span aria-hidden="true" style={{ color: meta.color, fontWeight: 700, flexShrink: 0 }}>
        {meta.icon}
      </span>
    </button>
  );
}

/**
 * Maps a raw engine `Position` to its *visual* grid position for a given `flipped` —
 * the inverse of `buildRows`'s own `rowOrder`/`colOrder` reversal (same formula
 * OnlineBoard.tsx's piece-layer overlay already uses for the identical problem).
 * `MiniBoard` draws `arrows` as literal indices into whatever grid array `rows` built —
 * it doesn't know engine coordinates exist, so an arrow built from raw `Position`s
 * pointed at the wrong squares the instant `flipped` was `true` (previously "sometimes"
 * — auto-flipping per ply — now a first-class prop, so this must always be right).
 */
function toVisual(pos: Position, flipped: boolean): Position {
  return {
    row: flipped ? pos.row : 7 - pos.row,
    col: flipped ? 7 - pos.col : pos.col,
  };
}

/**
 * Builds a read-only diagram of one ply's board state for `MiniBoard`, highlighting the
 * recommended move (gold ring on the piece that should've moved, gold star on where it
 * should land) and, when they differ, the move actually played (muted red) — chess.com's
 * own Game Review convention (review.png). Also surfaces what the reviewed move actually
 * captured: `boardState` already shows a captured piece's square as empty (it's been
 * removed from play), so this synthesizes a faded, X-marked piece there instead of
 * leaving it silently blank — "show the pieces that were taken." `review` is `undefined`
 * for the starting position, where there's nothing yet to highlight or show captured.
 */
function buildRows<V>(
  state: ReturnType<typeof replayMoves<V>>,
  variant: Variant<V>,
  flipped: boolean,
  review: PlyReview<V> | undefined,
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
      let highlight: MiniSquareSpec['highlight'] = null;
      if (review) {
        // Precedence: the recommended move's own squares always win (that's the
        // actionable teaching point), the played move's squares only show up in their
        // own muted color where they *don't* already coincide with the recommendation
        // — e.g. the right piece but the wrong destination still rings the origin gold.
        if (samePosition(pos, review.bestMove.to)) highlight = 'best-to';
        else if (samePosition(pos, review.bestMove.from)) highlight = 'best-from';
        else if (!review.isBest && samePosition(pos, review.playedMove.to)) highlight = 'played-to';
        else if (!review.isBest && samePosition(pos, review.playedMove.from)) highlight = 'played-from';
      }
      const capturedStep = !piece && review ? review.playedMove.captures.find((c) => samePosition(c.capturedAt, pos)) : undefined;
      const pieceSpec: MiniSquareSpec['piece'] = piece
        ? { owner: piece.owner, isDama: piece.isDama, label: variant.arithmetic.format(piece.value) }
        : capturedStep
          ? { owner: capturedStep.capturedPiece.owner, isDama: capturedStep.capturedPiece.isDama, label: variant.arithmetic.format(capturedStep.capturedPiece.value), captured: true }
          : null;
      cols.push({
        operation: operationGlyph(operationAt(pos)) as '+' | '−' | '×' | '÷',
        piece: pieceSpec,
        highlight,
      });
    }
    rows.push(cols);
  }
  return rows;
}

/**
 * A one-line, concrete explanation of *why* the played move fell short — chess.com
 * shows a short prose caption under its classification badge (review.png); this is the
 * same idea, templated from data `reviewPly` already computes (no new engine/AI work
 * needed) rather than free-form generation.
 */
function describeInsight<V>(review: PlyReview<V>): string {
  if (review.isBest) return "This was the engine's top choice in this position.";
  const bestFrom = squareName(review.bestMove.from);
  const bestTo = squareName(review.bestMove.to);
  const bestCaptures = review.bestMove.captures.length;
  const playedCaptures = review.playedMove.captures.length;
  const delta = review.delta.toFixed(1);
  if (bestCaptures > playedCaptures) {
    return `${playerLabel(review.mover)} missed a capture — ${bestFrom}→${bestTo} wins material instead, worth about ${delta} points.`;
  }
  if (playedCaptures > bestCaptures) {
    return `That capture backfires — ${bestFrom}→${bestTo} holds the advantage instead, worth about ${delta} points more.`;
  }
  return `${bestFrom}→${bestTo} was stronger here, worth about ${delta} points more than the move played.`;
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

const primaryButton = {
  background: 'var(--accent)',
  color: 'var(--accent-on)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

/**
 * Post-game AI review — chess.com's "Game Review," built on the existing packages/ai
 * engine rather than a new one: for every ply, `useGameReview` asks the engine's own
 * search "what was the best move here?" and classifies how far the move actually played
 * fell short. Works for both local and online games — either caller just hands over a
 * variant id and a finished game's move history.
 */
export function GameReviewScreen({
  variantId,
  moveHistory,
  perspective = 'white',
  onBackToLobby,
  onPracticePosition,
}: GameReviewScreenProps) {
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
  // Fixed for the whole review, not re-derived per ply from whoever's turn it is —
  // see the prop's own doc comment. The other player's moves still show (the board
  // itself, the arrows, the moves list are all unaffected), only the *orientation*
  // stays put.
  const flipped = perspective === 'black';
  // Which column the move list's "Player" side is -- same fallback the board orientation
  // itself uses when there's no single reviewer to default to (local friend mode).
  const reviewSide: Player = perspective ?? 'white';
  const currentReview: PlyReview<AnyValue> | undefined = activePly > 0 ? reviews[activePly - 1] : undefined;

  const arrows: MiniArrowSpec[] =
    currentReview && !currentReview.isBest
      ? [
          {
            from: toVisual(currentReview.bestMove.from, flipped),
            to: toVisual(currentReview.bestMove.to, flipped),
            kind: currentReview.bestMove.captures.length > 0 ? 'capture' : 'move',
          },
        ]
      : [];

  const rows = buildRows(boardState, variant, flipped, currentReview);
  const rowLabels = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const colLabels = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const canStepBack = activePly > 0;
  const canStepForward = activePly < reviews.length;
  const stepBack = () => setSelectedPly(Math.max(0, activePly - 1));
  const stepForward = () => setSelectedPly(Math.min(reviews.length, activePly + 1));

  const counts = reviews.reduce<Record<MoveClassification, number>>(
    (acc, r) => ({ ...acc, [r.classification]: acc[r.classification] + 1 }),
    { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
  );
  // Weighted by how many points each ply actually cost (plyAccuracy), not just a
  // count of best/excellent plies out of the total — see plyAccuracy's own doc
  // comment ("consider the points that was being taken").
  const accuracy = reviews.length > 0 ? Math.round(reviews.reduce((sum, r) => sum + plyAccuracy(r.delta), 0) / reviews.length) : null;

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
          {/* Board, then the insight/suggestion card with Prev/Next directly beneath it
              — both belong to "the position currently on screen," so they stay stacked
              together in this column instead of the card living apart in the sidebar. */}
          <div style={{ flex: '2 1 380px', maxWidth: 560, minWidth: 260, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--gap-md)' }}>
            <MiniBoard
              rows={rows}
              size="min(560px, 58vh, 100%)"
              arrows={arrows}
              rowLabels={rowLabels}
              colLabels={colLabels}
              label={`${variant.name} · ${activePly === 0 ? 'Starting position' : `after ply ${String(activePly)}`}`}
            />

            <div style={{ ...cardStyle, width: '100%' }}>
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
                  {/* The "why" — chess.com's own short prose caption under its classification badge (review.png). */}
                  <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>{describeInsight(currentReview)}</p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                  Starting position. {reviews.length > 0 ? 'Step through the game to see how each move was judged.' : ''}
                </p>
              )}
              <div style={{ display: 'flex', gap: 'var(--gap-sm)', marginTop: 'var(--pad-md)' }}>
                <button type="button" onClick={stepBack} disabled={!canStepBack} style={secondaryButton} aria-label="Previous move">
                  ◂ Prev
                </button>
                <button type="button" onClick={stepForward} disabled={!canStepForward} style={{ ...primaryButton, flex: 1 }} aria-label="Next move">
                  Next ▸
                </button>
              </div>
              {/* Only on an actual mistake (isBest === true has nothing to practice) and
                  only once a caller has somewhere to send it (App.tsx's enterPractice) —
                  hands over the position *before* this ply, not the position currently
                  on screen (which already shows the mistake having happened). */}
              {onPracticePosition && currentReview && !currentReview.isBest && (
                <button
                  type="button"
                  onClick={() => onPracticePosition(variantId, moveHistory.slice(0, currentReview.ply - 1), currentReview.mover)}
                  style={{ ...secondaryButton, width: '100%', marginTop: 'var(--pad-sm)' }}
                >
                  🔁 Practice this position
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
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
                {/* Two columns, "Player" (the reviewer's own side, `perspective`) then
                    "Opponent" — same round-pairing convention as MoveLedger.tsx's online/
                    local log, so a review taken from Black's side lists moves in the
                    opposite column order from one taken from White's. */}
                <div style={{ display: 'flex', gap: 'var(--gap-sm)', padding: '2px var(--pad-sm)', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span style={{ minWidth: '1.6em' }} />
                  <span style={{ flex: 1 }}>{playerLabel(reviewSide)}</span>
                  <span style={{ flex: 1 }}>{playerLabel(reviewSide === 'white' ? 'black' : 'white')}</span>
                </div>
                {buildReviewRounds(reviews).map(({ round, white, black }) => {
                  const leftReview = reviewSide === 'white' ? white : black;
                  const rightReview = reviewSide === 'white' ? black : white;
                  return (
                    <div key={round} style={{ display: 'flex', gap: 'var(--gap-sm)', alignItems: 'stretch' }}>
                      <span style={{ minWidth: '1.6em', color: 'var(--text-muted)', fontSize: 'var(--fs-meta)', paddingTop: 'var(--pad-sm)' }}>{round}.</span>
                      <ReviewCell review={leftReview} isActive={activePly === leftReview?.ply} onSelect={setSelectedPly} />
                      <ReviewCell review={rightReview} isActive={activePly === rightReview?.ply} onSelect={setSelectedPly} />
                    </div>
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
