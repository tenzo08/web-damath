import { applyMove, legalMoves } from '@damath/engine';
import type { GameState, Move, Player, Variant } from '@damath/engine';
import { DEFAULT_WEIGHTS, evaluate, toNumberFor } from '@damath/ai';
import type { SearchOptions, SearchResult } from '@damath/ai';
import { samePosition } from './board';

export type MoveClassification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * A fixed, blunder-free analysis budget distinct from the four play tiers (learner/
 * steady/sharp/tournament) — those are tuned for opponent strength/UX, this is tuned for
 * "finish a whole game's review in a reasonable time while still catching real
 * blunders." Deliberately shallower than 'tournament' (maxDepth 8, 3000ms): a full
 * review runs up to two searches per ply, and a 20-40 ply game at tournament's budget
 * would take minutes, not seconds.
 */
export const REVIEW_SEARCH_OPTIONS: SearchOptions = { maxDepth: 5, timeBudgetMs: 250, blunderRate: 0 };

/**
 * Score-delta bands (in the AI's own internal eval units — roughly comparable to piece-
 * value magnitude, per evaluate.ts's dominant `score` weight) separating one
 * classification from the next. Not derived from any formal source — a deliberate,
 * documented interpretation (same spirit as several rules-spec gaps in KNOWLEDGE.md),
 * tuned by feel rather than measured against a labelled dataset.
 */
const CLASSIFICATION_BANDS: readonly { max: number; classification: MoveClassification }[] = [
  { max: 0.01, classification: 'best' },
  { max: 1, classification: 'excellent' },
  { max: 3, classification: 'good' },
  { max: 6, classification: 'inaccuracy' },
  { max: 12, classification: 'mistake' },
  { max: Infinity, classification: 'blunder' },
];

export function classifyDelta(delta: number): MoveClassification {
  const clamped = Math.max(0, delta);
  for (const band of CLASSIFICATION_BANDS) {
    if (clamped <= band.max) return band.classification;
  }
  /* c8 ignore next */
  return 'blunder'; // unreachable -- the last band's max is Infinity
}

export interface PlyReview<V> {
  ply: number;
  mover: Player;
  playedMove: Move<V>;
  bestMove: Move<V>;
  isBest: boolean;
  /** Non-negative — how much worse the played move was than the engine's best, in eval units. 0 for the best move itself. */
  delta: number;
  classification: MoveClassification;
}

/**
 * Two moves count as "the same" only if they capture exactly the same squares in the
 * same order, not just share the same `from`/`to`. A Dama's multi-direction captures can
 * legitimately produce distinct maximal-length sequences that start and land on the same
 * two squares while capturing different pieces along different paths (moves.ts's
 * maximal-capture rule only constrains sequence *length*, not which squares are taken) —
 * comparing `from`/`to` alone would let a genuinely worse capture path get scored as
 * "best" just because it happened to start and end in the same place as the real best
 * move. Comparing `captures.length` first is a cheap short-circuit; `capturedAt` (not
 * `capturedPiece`) is the actual identity check per step, since a square uniquely
 * identifies which piece was captured there without needing to compare piece values.
 */
export function isSameMove<V>(a: Move<V>, b: Move<V>): boolean {
  if (!samePosition(a.from, b.from) || !samePosition(a.to, b.to)) return false;
  if (a.captures.length !== b.captures.length) return false;
  return a.captures.every((step, i) => {
    const other = b.captures[i];
    return other !== undefined && samePosition(step.capturedAt, other.capturedAt) && samePosition(step.landedAt, other.landedAt);
  });
}

/**
 * Reviews one ply: how good was `playedMove` compared to the engine's own best move from
 * the same position? `search` is injected (a real caller wires it to a Web Worker
 * request; tests inject a stub) so this stays pure and synchronously testable — the same
 * "the actual logic is worker-free-testable" split `worker-protocol.ts`'s
 * `handleAiRequest` already uses.
 *
 * The "how good was the actual move" half is a documented approximation, not an exact
 * search: `chooseMove` only ever evaluates from the position it's called on, relative to
 * *that* position's own side to move (search.ts: "fixed-perspective evaluate(rootPlayer)")
 * — there's no way to ask it "value this specific candidate from a different player's
 * perspective." Searching the position *after* the played move gives a value from the
 * opponent's perspective; negating it back to the original mover's perspective is exact
 * for evaluate.ts's dominant score/onBoardValue/promotionProximity terms (genuine
 * `player - opponent` diffs, so negating them is mathematically exact), but only
 * approximate for its small mobility/exposure terms (computed per-player, not as a diff,
 * so they aren't perfectly anti-symmetric). Those two terms carry a combined weight of
 * 0.06 against the score term's 1.0 (evaluate.ts's DEFAULT_WEIGHTS), so the resulting
 * error is small relative to the classification bands above.
 */
export async function reviewPly<V>(
  variant: Variant<V>,
  stateBefore: GameState<V>,
  playedMove: Move<V>,
  ply: number,
  search: (state: GameState<V>) => Promise<SearchResult<V>>,
): Promise<PlyReview<V>> {
  const mover = stateBefore.turn;
  const best = await search(stateBefore);

  if (isSameMove(playedMove, best.move)) {
    return { ply, mover, playedMove, bestMove: best.move, isBest: true, delta: 0, classification: 'best' };
  }

  const stateAfterActual = applyMove(stateBefore, playedMove, variant, { checkGameOver: false });
  const toNumber = toNumberFor<V>(variant.id);
  const actualScoreForMover =
    legalMoves(stateAfterActual).length === 0
      ? evaluate(stateAfterActual, mover, variant, toNumber, DEFAULT_WEIGHTS)
      : -(await search(stateAfterActual)).score;

  const delta = Math.max(0, best.score - actualScoreForMover);
  return { ply, mover, playedMove, bestMove: best.move, isBest: false, delta, classification: classifyDelta(delta) };
}
