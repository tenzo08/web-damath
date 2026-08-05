import { applyMove, finalScores, legalMoves, replayMoves } from '@damath/engine';
import type { GameState, Move, Player, Position, Variant, VariantId } from '@damath/engine';

export type OpponentType = 'human' | 'bot';

export interface PublicGameView {
  readonly roomId: string;
  readonly variantId: VariantId;
  readonly board: readonly (readonly ({ owner: Player; isDama: boolean; value: string } | null)[])[];
  readonly turn: Player;
  readonly scores: { readonly white: string; readonly black: string };
  readonly status: 'active' | 'finished';
  readonly finalScores: { readonly white: string; readonly black: string } | null;
  readonly moveCount: number;
  readonly players: { readonly white: string | null; readonly black: string | null };
  readonly opponentType: OpponentType;
  readonly botTier: string | null;
  readonly resignedBy: Player | null;
}

export type MoveOutcome = { ok: true; view: PublicGameView } | { ok: false; error: string };

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export interface RoomHandle {
  readonly id: string;
  readonly variantId: VariantId;
  readonly opponentType: OpponentType;
  readonly botTier: string | null;
  readonly players: { readonly white: string | null; readonly black: string | null };
  colorOf(userId: string): Player | null;
  getView(): PublicGameView;
  /**
   * Assigns an empty seat to `userId`. A no-op if the seat is already taken by someone
   * else — the caller (`RoomManager.joinRoom`) is expected to check first. Awaited: the
   * seat assignment is persisted before this resolves, so a caller that immediately
   * reads the room back (a reconnect, a restart) never observes a stale seat.
   */
  assignPlayer(color: Player, userId: string): Promise<void>;
  /** Server-side validation, never the client's move: looks up the matching entry in `legalMoves(state)` by `from`/`to` and rejects anything else (PLANNING.md, "never trust the client"). Awaited so the move is durably persisted before the caller's response goes out — "a game is its move list" only holds if the list is actually on disk. */
  applyPlayerMove(from: Position, to: Position, byUserId: string): Promise<MoveOutcome>;
  resign(byUserId: string): Promise<MoveOutcome>;
  isBotTurn(): boolean;
  applyBotMove(): Promise<MoveOutcome>;
}

export interface CreateRoomParams<V> {
  id: string;
  variant: Variant<V>;
  players: { white: string | null; black: string | null };
  opponentType: OpponentType;
  botTier: string | null;
  initialMoveHistory: readonly Move<V>[];
  initialResignedBy: Player | null;
  onPersist: (
    moveHistory: readonly Move<V>[],
    status: 'active' | 'finished',
    resignedBy: Player | null,
    players: { white: string | null; black: string | null },
  ) => Promise<void>;
  /**
   * Only ever supplied for a bot room, where the caller (`rooms.ts`) already knows `V`
   * is `number` because it picked one of the three AI-supported variants — so this
   * closure unifies `V = number` at that one call site with no cast anywhere. A human
   * room simply omits it.
   */
  chooseBotMove?: (game: GameState<V>) => Move<V>;
}

/**
 * Builds a `RoomHandle` closed over a concrete `V` — the generic parameter never
 * escapes the returned object's type, so `RoomManager` can hold a plain, non-generic
 * `Map<string, RoomHandle>` across rooms of different variants (mirrors `apps/web`'s
 * `useGame<V>` closing over its own `V` the same way).
 */
export function createRoomHandle<V>(params: CreateRoomParams<V>): RoomHandle {
  let game: GameState<V> = replayMoves(params.variant, params.initialMoveHistory);
  let resignedBy: Player | null = params.initialResignedBy;
  let players = { ...params.players };

  function colorOf(userId: string): Player | null {
    if (players.white === userId) return 'white';
    if (players.black === userId) return 'black';
    return null;
  }

  async function assignPlayer(color: Player, userId: string): Promise<void> {
    if (players[color] !== null) return;
    players = { ...players, [color]: userId };
    await params.onPersist(game.moveHistory, game.status, resignedBy, players);
  }

  function isOver(): boolean {
    return game.status === 'finished' || resignedBy !== null;
  }

  function getView(): PublicGameView {
    const arithmetic = params.variant.arithmetic;
    const over = isOver();
    const finals = over ? finalScores(game, arithmetic) : null;
    return {
      roomId: params.id,
      variantId: params.variant.id,
      board: game.board.map((row) =>
        row.map((piece) => (piece ? { owner: piece.owner, isDama: piece.isDama, value: arithmetic.format(piece.value) } : null)),
      ),
      turn: game.turn,
      scores: { white: arithmetic.format(game.scores.white), black: arithmetic.format(game.scores.black) },
      status: over ? 'finished' : 'active',
      finalScores: finals ? { white: arithmetic.format(finals.white), black: arithmetic.format(finals.black) } : null,
      moveCount: game.moveHistory.length,
      players,
      opponentType: params.opponentType,
      botTier: params.botTier,
      resignedBy,
    };
  }

  async function commit(next: GameState<V>): Promise<MoveOutcome> {
    game = next;
    await params.onPersist(game.moveHistory, game.status, resignedBy, players);
    return { ok: true, view: getView() };
  }

  async function applyPlayerMove(from: Position, to: Position, byUserId: string): Promise<MoveOutcome> {
    if (isOver()) return { ok: false, error: 'game is over' };
    const color = colorOf(byUserId);
    if (color === null) return { ok: false, error: 'you are not a player in this room' };
    if (color !== game.turn) return { ok: false, error: 'not your turn' };
    const legal = legalMoves(game).find((m) => samePosition(m.from, from) && samePosition(m.to, to));
    if (!legal) return { ok: false, error: 'illegal move' };
    return commit(applyMove(game, legal, params.variant));
  }

  async function resign(byUserId: string): Promise<MoveOutcome> {
    if (isOver()) return { ok: false, error: 'game is over' };
    const color = colorOf(byUserId);
    if (color === null) return { ok: false, error: 'you are not a player in this room' };
    resignedBy = color;
    await params.onPersist(game.moveHistory, game.status, resignedBy, players);
    return { ok: true, view: getView() };
  }

  function isBotTurn(): boolean {
    if (params.opponentType !== 'bot' || !params.chooseBotMove) return false;
    if (isOver()) return false;
    const botColor = colorOf('bot');
    return botColor !== null && botColor === game.turn;
  }

  async function applyBotMove(): Promise<MoveOutcome> {
    if (!isBotTurn() || !params.chooseBotMove) return { ok: false, error: "not the bot's turn" };
    return commit(applyMove(game, params.chooseBotMove(game), params.variant));
  }

  return {
    id: params.id,
    variantId: params.variant.id,
    opponentType: params.opponentType,
    botTier: params.botTier,
    get players() {
      return players;
    },
    colorOf,
    getView,
    assignPlayer,
    applyPlayerMove,
    resign,
    isBotTurn,
    applyBotMove,
  };
}
