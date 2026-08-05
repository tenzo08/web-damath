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
} from './types.js';

export { BOARD_SIZE, createGame, deserialize, isOnBoard, pieceAt, serialize } from './board.js';
export { legalMoves } from './moves.js';
export { applyMove, isGameOver, finalScores } from './game.js';
export type { ApplyMoveOptions } from './game.js';
export { scoreCapture } from './scoring.js';

export {
  OPERATION_LAYOUT,
  operationAt,
  PROMOTION_SQUARES_ROW_0,
  PROMOTION_SQUARES_ROW_7,
} from './data/operation-layout.js';
export type { IntegerVariant } from './data/variants.js';
export { COUNTING_DAMATH, INTEGER_DAMATH, INTEGER_VARIANTS, WHOLE_DAMATH } from './data/variants.js';
