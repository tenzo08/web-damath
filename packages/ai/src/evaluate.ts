import { finalScores, legalMoves } from '@damath/engine';
import type { GameState, Player } from '@damath/engine';

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
function exposure(state: GameState, player: Player): number {
  const hypotheticalOpponentTurn: GameState = { ...state, turn: opponentOf(player) };
  const seen = new Set<string>();
  let total = 0;
  for (const move of legalMoves(hypotheticalOpponentTurn)) {
    for (const step of move.captures) {
      if (step.capturedPiece.owner !== player) continue;
      const key = `${String(step.capturedAt.row)},${String(step.capturedAt.col)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total += step.capturedPiece.value;
    }
  }
  return total;
}

function mobility(state: GameState, player: Player): number {
  return legalMoves({ ...state, turn: player }).length;
}

/**
 * Heuristic evaluation from `player`'s perspective. At a terminal position (no legal
 * moves for whoever's actually to move), returns the *exact* final-score differential
 * (§8) scaled by the score weight — exact endgame evaluation is free here and keeps the
 * AI from misplaying a position it could otherwise resolve for certain.
 */
export function evaluate(state: GameState, player: Player, weights: EvaluationWeights = DEFAULT_WEIGHTS): number {
  const opponent = opponentOf(player);

  if (legalMoves(state).length === 0) {
    const totals = finalScores(state);
    return weights.score * (totals[player] - totals[opponent]);
  }

  const scoreDiff = state.scores[player] - state.scores[opponent];

  let onBoardValue = 0;
  let promotionProximity = 0;
  for (let row = 0; row < state.board.length; row++) {
    const boardRow = state.board[row];
    if (!boardRow) continue;
    for (const piece of boardRow) {
      if (!piece) continue;
      const value = piece.value * (piece.isDama ? 2 : 1);
      onBoardValue += piece.owner === player ? value : -value;
      if (piece.owner === player && !piece.isDama) {
        promotionProximity += advancement(row, player) * piece.value;
      }
    }
  }

  return (
    weights.score * scoreDiff +
    weights.onBoardValue * onBoardValue +
    weights.promotionProximity * promotionProximity -
    weights.exposure * exposure(state, player) +
    weights.mobility * mobility(state, player)
  );
}
