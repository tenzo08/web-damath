import type { Arithmetic, Variant } from './arithmetic.js';
import { createGame, pieceAt } from './board.js';
import { PROMOTION_SQUARES_ROW_0, PROMOTION_SQUARES_ROW_7 } from './data/operation-layout.js';
import { legalMoves } from './moves.js';
import { scoreCaptureAt, substituteValueAt } from './scoring.js';
import type { Board, GameState, Move, Piece, Player, Position } from './types.js';

function cloneBoard<V>(board: Board<V>): (Piece<V> | null)[][] {
  return board.map((row) => row.slice());
}

function setSquare<V>(board: (Piece<V> | null)[][], pos: Position, piece: Piece<V> | null): void {
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

function freezeBoard<V>(board: (Piece<V> | null)[][]): Board<V> {
  return Object.freeze(board.map((row) => Object.freeze(row.slice())));
}

/**
 * Board/turn/scores/history transition with no game-over check — the building
 * block for both the public `applyMove` and repetition detection below, which
 * both need to advance a position without recursing back into `isGameOver`.
 */
function applyMoveCore<V>(state: GameState<V>, move: Move<V>, arithmetic: Arithmetic<V>): GameState<V> {
  const piece = pieceAt(state.board, move.from);
  if (!piece) {
    throw new Error(`No piece at (${String(move.from.row)},${String(move.from.col)})`);
  }

  const board = cloneBoard(state.board);
  let scoreDelta = arithmetic.zero;
  for (const step of move.captures) {
    scoreDelta = arithmetic.add(scoreDelta, scoreCaptureAt(piece, step.capturedPiece, step.landedAt, arithmetic));
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
    scores: { ...state.scores, [piece.owner]: arithmetic.add(state.scores[piece.owner], scoreDelta) },
    moveHistory: [...state.moveHistory, move],
  };
}

/** Board + turn only — deliberately excludes scores/history, matching "the exact position with the same player to move" (KNOWLEDGE.md, "Moves are repetitive"). */
function positionKey<V>(state: GameState<V>): string {
  return JSON.stringify({ board: state.board, turn: state.turn });
}

/**
 * Replays `state.moveHistory` from a fresh `createGame` to count how many
 * times the current position has occurred. Games are short (dozens of plies,
 * §7.2's 20-minute clock bounds it further), so replaying per check is simple
 * and correct; `packages/ai`'s search avoids this cost entirely via
 * `applyMove`'s `checkGameOver: false` option instead (KNOWLEDGE.md).
 */
function isThreefoldRepetition<V>(state: GameState<V>, variant: Variant<V>, arithmetic: Arithmetic<V>): boolean {
  let cur = createGame(variant);
  const counts = new Map<string, number>();
  counts.set(positionKey(cur), 1);
  for (const move of state.moveHistory) {
    cur = applyMoveCore(cur, move, arithmetic);
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
 *
 * `variant` is needed (not just `arithmetic`) because repetition detection
 * replays from `createGame(variant)`.
 */
export function isGameOver<V>(state: GameState<V>, variant: Variant<V>): boolean {
  return legalMoves(state).length === 0 || isThreefoldRepetition(state, variant, variant.arithmetic);
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
export function applyMove<V>(
  state: GameState<V>,
  move: Move<V>,
  variant: Variant<V>,
  options: ApplyMoveOptions = {},
): GameState<V> {
  const { checkGameOver = true } = options;
  const next = applyMoveCore(state, move, variant.arithmetic);
  if (!checkGameOver) {
    return { ...next, status: 'active' };
  }
  return { ...next, status: isGameOver(next, variant) ? 'finished' : 'active' };
}

/**
 * Reconstructs a `GameState` by replaying `moves` from `createGame(variant)`,
 * one `applyMove` per move. "Games are stored as move lists" (KNOWLEDGE.md) —
 * this is the shared primitive for anything that rebuilds a position from a
 * move list rather than a live `useGame` reducer: the replay/undo UI in
 * `apps/web`, and eventually the server's own reconnect-by-replay (Milestone 4).
 */
export function replayMoves<V>(variant: Variant<V>, moves: readonly Move<V>[]): GameState<V> {
  let state = createGame(variant);
  for (const move of moves) {
    state = applyMove(state, move, variant);
  }
  return state;
}

/**
 * Accumulated capture score plus remaining chips, Dama doubled (§8.1-8.2). A remaining
 * chip is substituted at its own resting square first when the variant defines
 * `Arithmetic<V>.substituteAt` (Polynomial's house rule) — identical to every other
 * variant's behavior when it doesn't.
 */
export function finalScores<V>(state: GameState<V>, arithmetic: Arithmetic<V>): Record<Player, V> {
  const totals: Record<Player, V> = { ...state.scores };
  for (let row = 0; row < state.board.length; row++) {
    const cols = state.board[row];
    if (!cols) continue;
    for (let col = 0; col < cols.length; col++) {
      const piece = cols[col];
      if (!piece) continue;
      const value = substituteValueAt(piece.value, { row, col }, arithmetic);
      const contribution = piece.isDama ? arithmetic.double(value) : value;
      totals[piece.owner] = arithmetic.add(totals[piece.owner], contribution);
    }
  }
  return totals;
}
