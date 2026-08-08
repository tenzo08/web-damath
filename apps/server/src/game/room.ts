import { applyMove, finalScores, legalMoves, replayMoves } from '@damath/engine';
import type { GameState, Move, Player, Position, Variant, VariantId } from '@damath/engine';

export type OpponentType = 'human' | 'bot';

/** Identifies the tournament bracket match (tournament/bracket.ts's `Match`) this room was created to play — `null` for an ordinary direct or matchmade game. */
export interface TournamentMatchRef {
  readonly tournamentId: string;
  readonly round: number;
  readonly index: number;
}

export interface PublicGameView {
  readonly roomId: string;
  readonly variantId: VariantId;
  readonly board: readonly (readonly ({ id: string; owner: Player; isDama: boolean; value: string } | null)[])[];
  readonly turn: Player;
  readonly scores: { readonly white: string; readonly black: string };
  readonly status: 'active' | 'finished';
  readonly finalScores: { readonly white: string; readonly black: string } | null;
  /** Resignation overrides score comparison, same rule apps/web's App.tsx uses for local play. `null` while active, or on an unresigned tie. */
  readonly winner: Player | null;
  readonly moveCount: number;
  /**
   * The raw, typed move list — unlike `board`/`scores` (pre-formatted strings, the
   * usual "online play sends a formatted view, not typed state" simplification), these
   * are genuine `Move<V>` values, just untyped here (`unknown`) for the same reason
   * `store.ts`'s `PersistedGame.moveHistory` is: `PublicGameView` stays non-generic so
   * `RoomHandle` can be held in a plain `Map` across rooms of different variants. A
   * completed move is inert historical data with no validation concerns, so the client
   * can safely re-attach a concrete `V` (once it knows `variantId`) and replay it
   * locally with the same `applyMove`/`replayMoves` local play already uses, to build a
   * moves list and browse earlier board positions — the identical JSON-boundary cast
   * `rooms.ts` already relies on to persist and rehydrate this exact array server-side.
   */
  readonly moveHistory: readonly unknown[];
  readonly players: { readonly white: string | null; readonly black: string | null };
  readonly opponentType: OpponentType;
  readonly botTier: string | null;
  /** A friendly display name (game/botNames.ts), never "Computer" -- null for a human game. */
  readonly botNickname: string | null;
  readonly resignedBy: Player | null;
  /** A real draw the players agreed to, distinct from a score-tie or resignation — see `computeWinner`. */
  readonly drawnByAgreement: boolean;
  /** The color that currently has a pending draw offer out, or `null` if none. Cleared by any move, by a response, or once the game ends. */
  readonly drawOfferedBy: Player | null;
  readonly tournamentMatch: TournamentMatchRef | null;
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
  readonly botNickname: string | null;
  readonly tournamentMatch: TournamentMatchRef | null;
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
  /** Human-vs-human only — a bot has no draw-acceptance logic to invoke, so this is rejected for a bot room rather than silently doing nothing. */
  offerDraw(byUserId: string): Promise<MoveOutcome>;
  respondDraw(byUserId: string, accept: boolean): Promise<MoveOutcome>;
  isBotTurn(): boolean;
  applyBotMove(): Promise<MoveOutcome>;
}

export interface CreateRoomParams<V> {
  id: string;
  variant: Variant<V>;
  players: { white: string | null; black: string | null };
  opponentType: OpponentType;
  botTier: string | null;
  botNickname: string | null;
  tournamentMatch: TournamentMatchRef | null;
  initialMoveHistory: readonly Move<V>[];
  initialResignedBy: Player | null;
  initialDrawnByAgreement: boolean;
  onPersist: (
    moveHistory: readonly Move<V>[],
    status: 'active' | 'finished',
    resignedBy: Player | null,
    drawnByAgreement: boolean,
    players: { white: string | null; black: string | null },
  ) => Promise<void>;
  /**
   * Only ever supplied for a bot room, where the caller (`rooms.ts`) already knows `V`
   * is `number` because it picked one of the three AI-supported variants — so this
   * closure unifies `V = number` at that one call site with no cast anywhere. A human
   * room simply omits it. Async: the search runs in a worker thread (`bot-pool.ts`),
   * never on the server's main event loop.
   */
  chooseBotMove?: (game: GameState<V>) => Promise<Move<V>>;
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
  let drawnByAgreement = params.initialDrawnByAgreement;
  // Ephemeral, deliberately never persisted (same reasoning as not persisting whose turn
  // it "feels like" — a pending offer that vanishes on a server restart is a fine
  // tradeoff, not worth a migration for).
  let drawOfferedBy: Player | null = null;
  let players = { ...params.players };

  function colorOf(userId: string): Player | null {
    if (players.white === userId) return 'white';
    if (players.black === userId) return 'black';
    return null;
  }

  async function assignPlayer(color: Player, userId: string): Promise<void> {
    if (players[color] !== null) return;
    players = { ...players, [color]: userId };
    await params.onPersist(game.moveHistory, game.status, resignedBy, drawnByAgreement, players);
  }

  function isOver(): boolean {
    return game.status === 'finished' || resignedBy !== null || drawnByAgreement;
  }

  /** Resignation overrides score comparison — mirrors apps/web's App.tsx, the client's own winner computation for local play. A draw by agreement is always `null`, regardless of the actual score split — the players agreed to stop, not to a tie. */
  function computeWinner(over: boolean, finals: { white: V; black: V } | null): Player | null {
    if (!over) return null;
    if (resignedBy) return resignedBy === 'white' ? 'black' : 'white';
    if (drawnByAgreement) return null;
    if (!finals) return null;
    const order = params.variant.arithmetic.compare(finals.white, finals.black);
    return order > 0 ? 'white' : order < 0 ? 'black' : null;
  }

  function getView(): PublicGameView {
    const arithmetic = params.variant.arithmetic;
    const over = isOver();
    const finals = over ? finalScores(game, arithmetic) : null;
    return {
      roomId: params.id,
      variantId: params.variant.id,
      board: game.board.map((row) =>
        row.map((piece) => (piece ? { id: piece.id, owner: piece.owner, isDama: piece.isDama, value: arithmetic.format(piece.value) } : null)),
      ),
      turn: game.turn,
      scores: { white: arithmetic.format(game.scores.white), black: arithmetic.format(game.scores.black) },
      status: over ? 'finished' : 'active',
      finalScores: finals ? { white: arithmetic.format(finals.white), black: arithmetic.format(finals.black) } : null,
      winner: computeWinner(over, finals),
      moveCount: game.moveHistory.length,
      moveHistory: game.moveHistory,
      players,
      opponentType: params.opponentType,
      botTier: params.botTier,
      botNickname: params.botNickname,
      resignedBy,
      drawnByAgreement,
      drawOfferedBy,
      tournamentMatch: params.tournamentMatch,
    };
  }

  async function commit(next: GameState<V>): Promise<MoveOutcome> {
    game = next;
    // Playing a move implicitly cancels any pending draw offer — standard board-game
    // convention (an offer is only live until the next move either side makes).
    drawOfferedBy = null;
    await params.onPersist(game.moveHistory, game.status, resignedBy, drawnByAgreement, players);
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
    await params.onPersist(game.moveHistory, game.status, resignedBy, drawnByAgreement, players);
    return { ok: true, view: getView() };
  }

  async function offerDraw(byUserId: string): Promise<MoveOutcome> {
    if (isOver()) return { ok: false, error: 'game is over' };
    if (params.opponentType === 'bot') return { ok: false, error: 'the computer opponent does not accept draw offers' };
    const color = colorOf(byUserId);
    if (color === null) return { ok: false, error: 'you are not a player in this room' };
    drawOfferedBy = color;
    return { ok: true, view: getView() };
  }

  async function respondDraw(byUserId: string, accept: boolean): Promise<MoveOutcome> {
    if (isOver()) return { ok: false, error: 'game is over' };
    const color = colorOf(byUserId);
    if (color === null) return { ok: false, error: 'you are not a player in this room' };
    if (drawOfferedBy === null) return { ok: false, error: 'no draw offer is pending' };
    if (drawOfferedBy === color) return { ok: false, error: 'you cannot respond to your own draw offer' };
    if (!accept) {
      drawOfferedBy = null;
      return { ok: true, view: getView() };
    }
    drawnByAgreement = true;
    drawOfferedBy = null;
    await params.onPersist(game.moveHistory, game.status, resignedBy, drawnByAgreement, players);
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
    const move = await params.chooseBotMove(game);
    // Re-check after the await -- the search can take up to `tiers.ts`'s 3s tournament
    // budget, during which the human could have resigned or the room could otherwise
    // have ended; committing a move onto an already-finished game would resurrect it.
    if (isOver()) return { ok: false, error: 'game is over' };
    return commit(applyMove(game, move, params.variant));
  }

  return {
    id: params.id,
    variantId: params.variant.id,
    opponentType: params.opponentType,
    botTier: params.botTier,
    botNickname: params.botNickname,
    tournamentMatch: params.tournamentMatch,
    get players() {
      return players;
    },
    colorOf,
    getView,
    assignPlayer,
    applyPlayerMove,
    resign,
    offerDraw,
    respondDraw,
    isBotTurn,
    applyBotMove,
  };
}
