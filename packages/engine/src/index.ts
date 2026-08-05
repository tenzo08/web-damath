export type {
  Board,
  CaptureStep,
  GameState,
  IntegerVariantId,
  Move,
  Operation,
  OperationSquare,
  Piece,
  Player,
  Position,
  VariantId,
} from './types.js';

export type { Arithmetic, Variant } from './arithmetic.js';
export { numberArithmetic } from './arithmetic.js';

export { BOARD_SIZE, createGame, deserialize, isOnBoard, pieceAt, serialize } from './board.js';
export { legalMoves } from './moves.js';
export { applyMove, isGameOver, finalScores, replayMoves } from './game.js';
export type { ApplyMoveOptions } from './game.js';
export { scoreCapture } from './scoring.js';

export {
  OPERATION_LAYOUT,
  operationAt,
  PROMOTION_SQUARES_ROW_0,
  PROMOTION_SQUARES_ROW_7,
} from './data/operation-layout.js';

export { COUNTING_DAMATH, INTEGER_DAMATH, INTEGER_VARIANTS, WHOLE_DAMATH } from './data/variants.js';

export { FRACTION_DAMATH, RATIONAL_DAMATH, fraction, fractionArithmetic, formatFraction, reduceFraction } from './data/fraction.js';
export type { Fraction } from './data/fraction.js';

export { RADICAL_DAMATH, radical, radicalArithmetic } from './data/radical.js';
export type { Radical, RadicalTerm } from './data/radical.js';

export { POLYNOMIAL_DAMATH, polynomial, polynomialArithmetic } from './data/polynomial.js';
export type { Polynomial, PolynomialTerm } from './data/polynomial.js';

import type { Fraction } from './data/fraction.js';
import type { Polynomial } from './data/polynomial.js';
import type { Radical } from './data/radical.js';
import type { Variant } from './arithmetic.js';
import { COUNTING_DAMATH, INTEGER_DAMATH, WHOLE_DAMATH } from './data/variants.js';
import { FRACTION_DAMATH, RATIONAL_DAMATH } from './data/fraction.js';
import { RADICAL_DAMATH } from './data/radical.js';
import { POLYNOMIAL_DAMATH } from './data/polynomial.js';

/** Any of the seven official variants — grade-ascending order, matching docs/VARIANTS.md. */
export type AnyVariant = Variant<number> | Variant<Fraction> | Variant<Radical> | Variant<Polynomial>;

export const ALL_VARIANTS: readonly AnyVariant[] = [
  COUNTING_DAMATH,
  WHOLE_DAMATH,
  FRACTION_DAMATH,
  INTEGER_DAMATH,
  RATIONAL_DAMATH,
  RADICAL_DAMATH,
  POLYNOMIAL_DAMATH,
];
