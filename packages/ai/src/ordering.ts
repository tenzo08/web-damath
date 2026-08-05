import { operationAt, pieceAt, PROMOTION_SQUARES_ROW_0, PROMOTION_SQUARES_ROW_7, scoreCapture } from '@damath/engine';
import type { GameState, Move, Player } from '@damath/engine';
import { randomInt } from './rng.js';

function isPromotionSquare(move: Move, mover: Player): boolean {
  const squares = mover === 'white' ? PROMOTION_SQUARES_ROW_7 : PROMOTION_SQUARES_ROW_0;
  return squares.some((s) => s.row === move.to.row && s.col === move.to.col);
}

/**
 * A cheap proxy for "how good does this move look," used only to sort the move list
 * before search — never as the actual evaluation. `legalMoves` already enforces
 * mandatory-maximal-capture (§4.2-4.3), so every move in one call's result already has
 * the same capture count; what's left to rank is the resulting score (§5.1) and
 * whether it promotes (docs/AI_OPPONENT.md §6: "captures first, then higher-scoring
 * captures, then promotions").
 */
function orderingScore(state: GameState, move: Move): number {
  const mover = pieceAt(state.board, move.from);
  if (!mover) return 0;
  let captureScore = 0;
  for (const step of move.captures) {
    captureScore += scoreCapture(mover, step.capturedPiece, operationAt(step.landedAt));
  }
  const promotes = !mover.isDama && isPromotionSquare(move, mover.owner);
  return captureScore * 10 + (promotes ? 5 : 0);
}

function samePosition(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  return a.row === b.row && a.col === b.col;
}

function sameMove(a: Move, b: Move): boolean {
  return samePosition(a.from, b.from) && samePosition(a.to, b.to) && a.captures.length === b.captures.length;
}

/**
 * Shuffles ties for variety, then stable-sorts by `orderingScore` descending, then
 * moves `pv` (the previous iterative-deepening depth's best move) to the very front —
 * the fix for reference/'s F4 bug, where each depth restarted from an unordered list
 * and threw away the prior depth's work.
 */
export function orderMoves(state: GameState, moves: readonly Move[], rng: () => number, pv: Move | null): Move[] {
  const shuffled = moves.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const a = shuffled[i];
    const b = shuffled[j];
    if (a === undefined || b === undefined) continue;
    shuffled[i] = b;
    shuffled[j] = a;
  }
  shuffled.sort((a, b) => orderingScore(state, b) - orderingScore(state, a));

  if (pv) {
    const index = shuffled.findIndex((m) => sameMove(m, pv));
    if (index > 0) {
      const [found] = shuffled.splice(index, 1);
      if (found) shuffled.unshift(found);
    }
  }
  return shuffled;
}

export { sameMove };
