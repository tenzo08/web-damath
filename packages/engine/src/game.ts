import { createGame, pieceAt } from './board.js';
import { operationAt, PROMOTION_SQUARES_ROW_0, PROMOTION_SQUARES_ROW_7 } from './data/operation-layout.js';
import { legalMoves } from './moves.js';
import { scoreCapture } from './scoring.js';
import type { Board, GameState, Move, Piece, Player, Position } from './types.js';

function cloneBoard(board: Board): (Piece | null)[][] {
  return board.map((row) => row.slice());
}

function setSquare(board: (Piece | null)[][], pos: Position, piece: Piece | null): void {
  const row = board[pos.row];
  if (!row) {
    throw new Error(`Row ${String(pos.row)} is out of bounds`);
  }
  row[pos.col] = piece;
}

function isPromotionSquare(pos: Position, player: Player): boolean {
  // White advances toward row 7, black toward row 0 (§2.1, types.ts) — each
  // promotes on the far player's home row (§6.1).
  const squares = player === 'white' ? PROMOTION_SQUARES_ROW_7 : PROMOTION_SQUARES_ROW_0;
  return squares.some((s) => s.row === pos.row && s.col === pos.col);
}

function freezeBoard(board: (Piece | null)[][]): Board {
  return Object.freeze(board.map((row) => Object.freeze(row.slice())));
}

/**
 * Board/turn/scores/history transition with no game-over check — the building
 * block for both the public `applyMove` and repetition detection below, which
 * both need to advance a position without recursing back into `isGameOver`.
 */
function applyMoveCore(state: GameState, move: Move): GameState {
  const piece = pieceAt(state.board, move.from);
  if (!piece) {
    throw new Error(`No piece at (${String(move.from.row)},${String(move.from.col)})`);
  }

  const board = cloneBoard(state.board);
  let scoreDelta = 0;
  for (const step of move.captures) {
    scoreDelta += scoreCapture(piece, step.capturedPiece, operationAt(step.landedAt));
    setSquare(board, step.capturedAt, null);
  }

  setSquare(board, move.from, null);
  // "Stops on" (§6.2): only the move's final square can promote, never a
  // mid-chain capturedAt/landedAt square passed through along the way.
  const promoted = !piece.isDama && isPromotionSquare(move.to, piece.owner);
  setSquare(board, move.to, promoted ? { ...piece, isDama: true } : piece);

  return {
    ...state,
    board: freezeBoard(board),
    turn: piece.owner === 'white' ? 'black' : 'white',
    scores: { ...state.scores, [piece.owner]: state.scores[piece.owner] + scoreDelta },
    moveHistory: [...state.moveHistory, move],
  };
}

/** Board + turn only — deliberately excludes scores/history, matching "the exact position with the same player to move" (KNOWLEDGE.md, "Moves are repetitive"). */
function positionKey(state: GameState): string {
  return JSON.stringify({ board: state.board, turn: state.turn });
}

/**
 * Replays `state.moveHistory` from a fresh `createGame` to count how many
 * times the current position has occurred. Games are short (dozens of plies,
 * §7.2's 20-minute clock bounds it further), so replaying per check is simple
 * and correct; revisit only if AI search (Milestone 3) profiles it as a
 * bottleneck — see TASK.md backlog, "Transposition table in the AI".
 */
function isThreefoldRepetition(state: GameState): boolean {
  let cur = createGame(state.variant);
  const counts = new Map<string, number>();
  counts.set(positionKey(cur), 1);
  for (const move of state.moveHistory) {
    cur = applyMoveCore(cur, move);
    const key = positionKey(cur);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (counts.get(positionKey(state)) ?? 0) >= 3;
}

/**
 * True when the game has ended (§7.3): the player to move has no legal move
 * at all — this single check covers both "no more chips to move" and
 * "cornered" (KNOWLEDGE.md, "Cornered" — a deliberate player-level reading,
 * corroborated by `reference/`'s identical collapse of the two conditions) —
 * or the position has repeated three times (§7.5). The 20-minute clock (§7.1)
 * is wall-clock state the pure engine doesn't track; that belongs to the
 * server/UI layer that owns real time.
 */
export function isGameOver(state: GameState): boolean {
  return legalMoves(state).length === 0 || isThreefoldRepetition(state);
}

export interface ApplyMoveOptions {
  /**
   * Default true. When false, skips `isGameOver` entirely — in particular its
   * O(moveHistory) threefold-repetition replay from `createGame` — and always
   * returns `status: 'active'`.
   *
   * Built for search (packages/ai): minimax calls `applyMove` thousands of
   * times per move choice, and replaying the whole game history from scratch
   * at every simulated ply is the exact bottleneck KNOWLEDGE.md's "Repetition
   * detection" entry flagged as a future revisit. Search does its own cheap
   * terminal check (`legalMoves(state).length === 0`) instead and never needs
   * repetition detection mid-search. Real gameplay must keep the default
   * (`true`) — `status`/repetition are only correct with the check enabled.
   */
  checkGameOver?: boolean;
}

/**
 * Applies one legal move, returning a new `GameState` — the input is never
 * mutated (1.8). Scores each capture step individually and sums them (§5.6),
 * promotes only on the final landing square (§6.2), and marks the resulting
 * state `finished` when `isGameOver` holds for it (unless `checkGameOver` is
 * disabled — see `ApplyMoveOptions`).
 */
export function applyMove(state: GameState, move: Move, options: ApplyMoveOptions = {}): GameState {
  const { checkGameOver = true } = options;
  const next = applyMoveCore(state, move);
  if (!checkGameOver) {
    return { ...next, status: 'active' };
  }
  return { ...next, status: isGameOver(next) ? 'finished' : 'active' };
}

/** Accumulated capture score plus remaining chips, Dama doubled (§8.1-8.2). */
export function finalScores(state: GameState): Record<Player, number> {
  const totals: Record<Player, number> = { ...state.scores };
  for (const row of state.board) {
    for (const piece of row) {
      if (!piece) continue;
      totals[piece.owner] += piece.value * (piece.isDama ? 2 : 1);
    }
  }
  return totals;
}
