import { finalScores, legalMoves } from '@damath/engine';
import type { GameState, Player, Variant } from '@damath/engine';
import type { ToNumber } from './valueScale.js';

export interface EvaluationWeights {
  /** Banked score differential — the actual win condition (§8.3). Must dominate. */
  readonly score: number;
  /** On-board value differential, Dama counted double. */
  readonly onBoardValue: number;
  /** Rows-from-promotion, weighted by piece value, own pieces only. */
  readonly promotionProximity: number;
  /** Sum of own piece values the opponent could capture right now. Subtracted. */
  readonly exposure: number;
  /** Legal move count, own side. Small tie-breaking weight. */
  readonly mobility: number;
}

/**
 * docs/AI_OPPONENT.md §5: banked score is the actual win condition and must dominate
 * material. This is the fix for reference/'s F1 bug (`score * 0.5` vs `material * 1.0`,
 * i.e. material-heavy) — see packages/ai/test/self-play.test.ts for the empirical
 * comparison and KNOWLEDGE.md for the recorded win rate.
 *
 * Kept as one universal set of weights across every variant, not tuned per variant —
 * `valueScale.ts`'s `ToNumber<V>` bridges are specifically designed to keep chip-value
 * magnitudes on a comparable real-number scale to the integer variants (Fraction
 * Damath's printed values are already tenths, e.g., not hundreds), so the same
 * relative weighting should transfer. Verified per-variant by self-play sanity checks
 * (test/all-variants.test.ts), not re-tuned from scratch for each one.
 */
export const DEFAULT_WEIGHTS: EvaluationWeights = {
  score: 1,
  onBoardValue: 0.05,
  promotionProximity: 0.02,
  exposure: 0.05,
  mobility: 0.01,
};

/** F1's mistake, kept only so self-play can demonstrate why it's wrong. Not used by any tier. */
export const MATERIAL_HEAVY_WEIGHTS: EvaluationWeights = {
  score: 0.5,
  onBoardValue: 1,
  promotionProximity: 0.4,
  exposure: 0,
  mobility: 0.2,
};

function opponentOf(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

function advancement(row: number, player: Player): number {
  return player === 'white' ? row : 7 - row;
}

/** Own pieces the opponent could capture right now, had they the move — a static-exchange-style proxy, not a search. */
function exposure<V>(state: GameState<V>, player: Player, toNumber: ToNumber<V>): number {
  const hypotheticalOpponentTurn: GameState<V> = { ...state, turn: opponentOf(player) };
  const seen = new Set<string>();
  let total = 0;
  for (const move of legalMoves(hypotheticalOpponentTurn)) {
    for (const step of move.captures) {
      if (step.capturedPiece.owner !== player) continue;
      const key = `${String(step.capturedAt.row)},${String(step.capturedAt.col)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total += toNumber(step.capturedPiece.value);
    }
  }
  return total;
}

function mobility<V>(state: GameState<V>, player: Player): number {
  return legalMoves({ ...state, turn: player }).length;
}

/**
 * Heuristic evaluation from `player`'s perspective. At a terminal position (no legal
 * moves for whoever's actually to move), returns the *exact* final-score differential
 * (§8) — computed via `finalScores`/`variant.arithmetic`, never approximated — scaled
 * by the score weight and only converted to a plain number (`toNumber`) at the very
 * end, after the exact comparison. Exact endgame evaluation is free here and keeps the
 * AI from misplaying a position it could otherwise resolve for certain.
 */
export function evaluate<V>(
  state: GameState<V>,
  player: Player,
  variant: Variant<V>,
  toNumber: ToNumber<V>,
  weights: EvaluationWeights = DEFAULT_WEIGHTS,
): number {
  const opponent = opponentOf(player);

  if (legalMoves(state).length === 0) {
    const totals = finalScores(state, variant.arithmetic);
    return weights.score * (toNumber(totals[player]) - toNumber(totals[opponent]));
  }

  const scoreDiff = toNumber(state.scores[player]) - toNumber(state.scores[opponent]);

  let onBoardValue = 0;
  let promotionProximity = 0;
  for (let row = 0; row < state.board.length; row++) {
    const boardRow = state.board[row];
    if (!boardRow) continue;
    for (const piece of boardRow) {
      if (!piece) continue;
      const magnitude = toNumber(piece.value);
      const value = magnitude * (piece.isDama ? 2 : 1);
      onBoardValue += piece.owner === player ? value : -value;
      if (piece.owner === player && !piece.isDama) {
        promotionProximity += advancement(row, player) * magnitude;
      }
    }
  }

  return (
    weights.score * scoreDiff +
    weights.onBoardValue * onBoardValue +
    weights.promotionProximity * promotionProximity -
    weights.exposure * exposure(state, player, toNumber) +
    weights.mobility * mobility(state, player)
  );
}
