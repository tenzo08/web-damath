import { OPERATION_LAYOUT, pieceAt } from '@damath/engine';
import type { GameState, Player, Position } from '@damath/engine';
import type { ToNumber } from './valueScale.js';

/**
 * The 32 playable squares, in a fixed row-then-column order — a stable index for the
 * NNUE feature vector below. Derived from `OPERATION_LAYOUT` (already exactly the 32
 * playable squares, per packages/engine/test/operation-layout.test.ts's own
 * completeness proof) rather than a second hand-written list, so there is exactly one
 * definition of "which 32 squares" anywhere in the workspace.
 */
export const NNUE_SQUARES: readonly Position[] = [...OPERATION_LAYOUT]
  .sort((a, b) => a.row - b.row || a.col - b.col)
  .map(({ row, col }) => ({ row, col }));

export const NNUE_FEATURES_PER_SQUARE = 6;
export const NNUE_INPUT_SIZE = NNUE_SQUARES.length * NNUE_FEATURES_PER_SQUARE;

/**
 * Divides a chip's `toNumber`-approximated value before it enters the network — keeps
 * every variant's input roughly unit-scale (12 is the highest integer-variant chip
 * value; `valueScale.ts`'s own doc comment already argues the other variants'
 * `toNumber` bridges stay on a comparable real-number scale, e.g. Fraction Damath's
 * printed values are tenths, not hundreds).
 */
const VALUE_SCALE = 12;

function advancementOf(row: number, player: Player): number {
  return player === 'white' ? row : 7 - row;
}

/**
 * Encodes a board position as a fixed 192-dim feature vector for the NNUE evaluator:
 * for each of the 32 playable squares, `[piece exists, owner is white, owner is black,
 * normalised value, is dama, advancement toward promotion]`. Perspective-neutral
 * (absolute white/black owner, not self/opponent) — mirrors
 * `reference/damath-engine/backend/ai/nnue.py`'s `encode_board` scheme, which
 * `docs/AI_OPPONENT.md` §2 already flagged as reusable "even without a neural net."
 *
 * This is the one function both `training/generate-selfplay.ts` (builds training
 * examples) and `nnueEval.ts` (runs inference) call — a single source of truth, so a
 * trained model's input format can never drift from what inference actually feeds it.
 */
export function encodeNnueFeatures<V>(state: GameState<V>, toNumber: ToNumber<V>): Float32Array {
  const features = new Float32Array(NNUE_INPUT_SIZE);
  for (let i = 0; i < NNUE_SQUARES.length; i++) {
    const pos = NNUE_SQUARES[i];
    if (!pos) continue; // unreachable -- NNUE_SQUARES is a fixed non-empty constant
    const piece = pieceAt(state.board, pos);
    if (!piece) continue; // all six features for an empty square stay 0
    const base = i * NNUE_FEATURES_PER_SQUARE;
    features[base + 0] = 1;
    features[base + 1] = piece.owner === 'white' ? 1 : 0;
    features[base + 2] = piece.owner === 'black' ? 1 : 0;
    features[base + 3] = toNumber(piece.value) / VALUE_SCALE;
    features[base + 4] = piece.isDama ? 1 : 0;
    features[base + 5] = advancementOf(pos.row, piece.owner) / 7;
  }
  return features;
}
