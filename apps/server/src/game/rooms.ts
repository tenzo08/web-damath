import { randomUUID } from 'node:crypto';
import type { DifficultyTier } from '@damath/ai';
import type { AnyVariant, Move, Player, Variant, VariantId } from '@damath/engine';
import { botThinkDelayMs, computeBotMove } from './bot.js';
import { randomBotNickname } from './botNames.js';
import { createRoomHandle, type MoveOutcome, type PublicGameView, type RoomHandle, type TournamentMatchRef } from './room.js';
import { BOT_PLAYER_ID, type GameStore, type PersistedGame } from './store.js';
import { findVariant } from './variants.js';
import type { UserStore } from '../auth/store.js';
import type { ModerationStore } from '../moderation/store.js';
import { BOT_TIER_RATING, PLACEMENT_GAMES_REQUIRED, PLACEMENT_K_FACTOR, PLACEMENT_TIER, nextRating, nextRatings } from '../rating/elo.js';

type ValueOf<T> = T extends Variant<infer V> ? V : never;

export interface RoomManagerOptions {
  gameStore: GameStore;
  /** Read/write per-account Elo ratings (rating/elo.ts) once a room finishes — see `updateRatingsIfFinished`. */
  userStore: UserStore;
  /** Checked before pairing two queued players — either having blocked the other skips that pairing entirely (moderation/store.ts). */
  moderationStore: ModerationStore;
  /** docs/AI_OPPONENT.md §9 — environment variables, never hard-coded constants. */
  queueBotTimeoutMs: number;
  queueBotEnabled: boolean;
  queueBotTier: DifficultyTier;
  /** Fires when a room's state changes from something *RoomManager itself* triggered asynchronously (the bot's own move) — a direct caller of `playMove`/`resign` already has the resulting view as its return value and doesn't need this. */
  onRoomUpdate: (view: PublicGameView) => void;
  /** Fires when a queued player is matched by an event they didn't themselves trigger (paired by someone else's `enqueue`, or the bot-fallback timer firing). The player who *called* `enqueue` gets their own match result as that call's return value instead. */
  onMatched: (userId: string, color: Player, view: PublicGameView) => void;
  /**
   * Fires once, the moment a tournament-linked room's game ends with a clear winner (not
   * a draw) — `app.ts` wires this to `TournamentManager.reportResult`, replacing the
   * manual "X won" report for rooms created via `createTournamentMatchRoom`. Awaited by
   * `playMove`/`resign` before their own promise resolves, so the tournament store is
   * durably updated before the caller (and the room's state broadcast) can be observed —
   * same "await so it's persisted first" rule room.ts's own docstrings describe. Optional
   * so tests/other embedders that don't care about tournaments can omit it.
   */
  onTournamentMatchFinished?: (ref: TournamentMatchRef, winnerUserId: string) => Promise<void>;
}

export type EnqueueResult = { status: 'queued' } | { status: 'matched'; room: RoomHandle; color: Player };
export type JoinResult = { ok: true; room: RoomHandle; color: Player | null } | { ok: false; error: string };

interface QueueEntry {
  readonly userId: string;
  readonly variantId: VariantId;
  declined: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Owns active rooms and the matchmaking queue. Never inspects a chip value — every
 * room is a closure over its own concrete `V` via `createRoomHandle` (room.ts), so this
 * class only ever holds the fully generic-erased `RoomHandle` surface.
 */
export class RoomManager {
  private readonly rooms = new Map<string, RoomHandle>();
  private readonly queue = new Map<string, QueueEntry>();
  /** `${tournamentId}:${round}:${index}` → roomId, so a second "play this match" click (or a page reload) returns the same room instead of spawning a duplicate. In-memory only — same scope as the file-backed stores (KNOWLEDGE.md), fine for a single dev server instance. */
  private readonly tournamentRoomIndex = new Map<string, string>();
  /**
   * `getRoom`'s cold-cache hydration in flight, keyed by roomId — without this, two
   * concurrent `getRoom` calls for a room not yet in `this.rooms` (e.g. right after a
   * server restart, before anyone's touched it again) each independently read the
   * persisted game and call `hydrate()`, and the second `hydrate()`'s `this.rooms.set()`
   * silently clobbers the first's — any caller still holding a reference to the first
   * `RoomHandle` (e.g. a `move`/`resign` already in progress against it) would then be
   * mutating a closure nothing else can ever see again. Concrete trigger this session
   * made more likely: two players disconnecting from the same untouched room around the
   * same moment, each independently calling `getRoom` from their own disconnect-forfeit
   * timer (`ws.ts`'s `scheduleDisconnectForfeit`).
   */
  private readonly hydrating = new Map<string, Promise<RoomHandle | null>>();

  constructor(private readonly options: RoomManagerOptions) {}

  async getRoom(roomId: string): Promise<RoomHandle | null> {
    const active = this.rooms.get(roomId);
    if (active) return active;
    const inFlight = this.hydrating.get(roomId);
    if (inFlight) return inFlight;
    const promise = (async () => {
      const persisted = await this.options.gameStore.findById(roomId);
      if (!persisted) return null;
      return this.hydrate(persisted);
    })();
    this.hydrating.set(roomId, promise);
    try {
      return await promise;
    } finally {
      this.hydrating.delete(roomId);
    }
  }

  /** A direct, invite-link room — the creator sits `white`, `black` waits for `joinRoom`. Distinct from matchmaking. */
  async createRoom(variantId: VariantId, creatorUserId: string): Promise<RoomHandle> {
    const variant = findVariant(variantId);
    if (!variant) throw new Error(`unknown variant id ${variantId}`);
    return this.persistAndInstantiateHuman(variant, { white: creatorUserId, black: null });
  }

  /**
   * A room seated for a specific tournament bracket match, both players known up front
   * (unlike `createRoom`'s invite-link flow, there's no waiting seat). Idempotent per
   * `(tournamentId, round, index)` — a second call (a re-click, a page reload) returns
   * the same room rather than creating a duplicate.
   */
  async createTournamentMatchRoom(
    variantId: VariantId,
    tournamentId: string,
    round: number,
    index: number,
    playerAId: string,
    playerBId: string,
  ): Promise<RoomHandle> {
    const key = `${tournamentId}:${String(round)}:${String(index)}`;
    const existingId = this.tournamentRoomIndex.get(key);
    if (existingId) {
      const existing = await this.getRoom(existingId);
      if (existing) return existing;
    }
    const variant = findVariant(variantId);
    if (!variant) throw new Error(`unknown variant id ${variantId}`);
    const room = await this.persistAndInstantiateHuman(variant, { white: playerAId, black: playerBId }, { tournamentId, round, index });
    this.tournamentRoomIndex.set(key, room.id);
    return room;
  }

  async joinRoom(roomId: string, userId: string): Promise<JoinResult> {
    const room = await this.getRoom(roomId);
    if (!room) return { ok: false, error: 'room not found' };
    const existingColor = room.colorOf(userId);
    if (existingColor) return { ok: true, room, color: existingColor };
    if (room.players.white !== null && room.players.black !== null) {
      return { ok: false, error: 'room is full' };
    }
    // Mutates the live handle in place (never delete+rehydrate) — any earlier caller
    // still holding this exact `RoomHandle` reference (e.g. the creator's own copy from
    // `createRoom`) must keep seeing the new seat, not a stale snapshot from before the
    // join.
    const color: Player = room.players.white === null ? 'white' : 'black';
    await room.assignPlayer(color, userId);
    return { ok: true, room, color };
  }

  /**
   * docs/AI_OPPONENT.md §9. Pairs immediately with another queued player wanting the
   * same variant, else starts a bot-fallback timer. Every variant has an AI now
   * (valueScale.ts's `ToNumber<V>` bridge), so the fallback is no longer restricted to
   * the three integer variants.
   *
   * An account still inside its placement window (rating/elo.ts's
   * `PLACEMENT_GAMES_REQUIRED`) skips human queue-matchmaking entirely and goes
   * straight to a bot game, no wait — "the system should check the level of the player"
   * before pairing them against a real opponent's rating. A direct-invite room
   * (`createRoom`/`joinRoom`) bypasses this gate on purpose: it's an opt-in match
   * between two people who already know each other, not the cold-start ranked pool
   * problem placement exists to solve.
   */
  async enqueue(userId: string, variantId: VariantId): Promise<EnqueueResult> {
    this.cancelQueue(userId);

    const user = await this.options.userStore.findById(userId);
    if (user && user.placementGamesPlayed < PLACEMENT_GAMES_REQUIRED) {
      const variant = findVariant(variantId);
      if (!variant) throw new Error(`unknown variant id ${variantId}`);
      const room = await this.persistAndInstantiateBot(variant, userId, PLACEMENT_TIER);
      return { status: 'matched', room, color: 'white' };
    }

    for (const [otherUserId, entry] of this.queue) {
      if (otherUserId === userId || entry.variantId !== variantId) continue;
      if (await this.options.moderationStore.isBlockedEitherWay(userId, otherUserId)) continue;
      this.clearTimer(entry);
      this.queue.delete(otherUserId);
      const variant = findVariant(variantId);
      if (!variant) throw new Error(`unknown variant id ${variantId}`);
      const room = await this.persistAndInstantiateHuman(variant, { white: otherUserId, black: userId });
      this.options.onMatched(otherUserId, 'white', room.getView());
      return { status: 'matched', room, color: 'black' };
    }

    const entry: QueueEntry = { userId, variantId, declined: false, timer: null };
    const variant = findVariant(variantId);
    if (this.options.queueBotEnabled && variant) {
      entry.timer = setTimeout(() => {
        void this.fallBackToBot(userId, variant);
      }, this.options.queueBotTimeoutMs);
    }
    this.queue.set(userId, entry);
    return { status: 'queued' };
  }

  /** The "keep waiting" opt-out (docs/AI_OPPONENT.md §9): cancels the pending bot fallback but leaves the player queued for a human. */
  declineBot(userId: string): void {
    const entry = this.queue.get(userId);
    if (!entry) return;
    entry.declined = true;
    this.clearTimer(entry);
  }

  cancelQueue(userId: string): void {
    const entry = this.queue.get(userId);
    if (!entry) return;
    this.clearTimer(entry);
    this.queue.delete(userId);
  }

  async playMove(roomId: string, userId: string, from: { row: number; col: number }, to: { row: number; col: number }): Promise<MoveOutcome> {
    const room = await this.getRoom(roomId);
    if (!room) return { ok: false, error: 'room not found' };
    const outcome = await room.applyPlayerMove(from, to, userId);
    if (outcome.ok) {
      await this.reportTournamentResultIfFinished(room, outcome.view);
      await this.updateRatingsIfFinished(room, outcome.view);
      this.scheduleBotReplyIfNeeded(room);
    }
    return outcome;
  }

  async resign(roomId: string, userId: string): Promise<MoveOutcome> {
    const room = await this.getRoom(roomId);
    if (!room) return { ok: false, error: 'room not found' };
    const outcome = await room.resign(userId);
    if (outcome.ok) {
      await this.reportTournamentResultIfFinished(room, outcome.view);
      await this.updateRatingsIfFinished(room, outcome.view);
    }
    return outcome;
  }

  async offerDraw(roomId: string, userId: string): Promise<MoveOutcome> {
    const room = await this.getRoom(roomId);
    if (!room) return { ok: false, error: 'room not found' };
    return room.offerDraw(userId);
  }

  async respondDraw(roomId: string, userId: string, accept: boolean): Promise<MoveOutcome> {
    const room = await this.getRoom(roomId);
    if (!room) return { ok: false, error: 'room not found' };
    const outcome = await room.respondDraw(userId, accept);
    // A drawn room never has a `view.winner`, so reportTournamentResultIfFinished's own
    // guard already leaves it for the manual report route — no separate check needed here.
    if (outcome.ok) await this.updateRatingsIfFinished(room, outcome.view);
    return outcome;
  }

  /**
   * Updates Elo ratings (rating/elo.ts) the instant a room finishes — human vs human
   * updates both accounts, human vs bot updates the human's rating against that tier's
   * fixed notional rating, and unlike tournament auto-report, a draw (`view.winner ===
   * null`) still counts: Elo has a well-defined draw outcome, there's no "needs a clear
   * winner to advance a bracket" constraint here. Fires exactly once per game, same
   * "further moves are rejected once the room is over" guarantee `reportTournamentResult
   * IfFinished` relies on.
   *
   * Also where a finished bot game counts toward the account's placement window
   * (rating/elo.ts's `PLACEMENT_GAMES_REQUIRED`) — `PLACEMENT_K_FACTOR` applies to
   * *this* game if the account was still inside that window when it started, then the
   * counter increments regardless of the outcome.
   */
  private async updateRatingsIfFinished(room: RoomHandle, view: PublicGameView): Promise<void> {
    if (view.status !== 'finished') return;
    try {
      if (room.opponentType === 'bot') {
        const botIsBlack = view.players.black === BOT_PLAYER_ID;
        const humanId = botIsBlack ? view.players.white : view.players.black;
        const humanColor: Player = botIsBlack ? 'white' : 'black';
        if (!humanId) return;
        const human = await this.options.userStore.findById(humanId);
        if (!human) return;
        const botRating = BOT_TIER_RATING[(room.botTier as DifficultyTier | null) ?? 'steady'];
        const outcome = view.winner === null ? 'draw' : view.winner === humanColor ? 'win' : 'loss';
        const inPlacement = human.placementGamesPlayed < PLACEMENT_GAMES_REQUIRED;
        const kFactor = inPlacement ? PLACEMENT_K_FACTOR : undefined;
        await this.options.userStore.update({
          ...human,
          rating: nextRating(human.rating, botRating, outcome, kFactor),
          placementGamesPlayed: inPlacement ? human.placementGamesPlayed + 1 : human.placementGamesPlayed,
        });
      } else {
        const { white, black } = view.players;
        if (!white || !black) return; // shouldn't happen once finished, but never guess at a missing seat
        const [whiteUser, blackUser] = await Promise.all([this.options.userStore.findById(white), this.options.userStore.findById(black)]);
        if (!whiteUser || !blackUser) return;
        const kFactorWhite = whiteUser.placementGamesPlayed < PLACEMENT_GAMES_REQUIRED ? PLACEMENT_K_FACTOR : undefined;
        const kFactorBlack = blackUser.placementGamesPlayed < PLACEMENT_GAMES_REQUIRED ? PLACEMENT_K_FACTOR : undefined;
        const next = nextRatings(whiteUser.rating, blackUser.rating, view.winner, kFactorWhite, kFactorBlack);
        // Sequential, not `Promise.all` — `FileUserStore.update` is a whole-file
        // read-modify-write; two concurrent updates would both read the same stale file
        // and the second write would silently clobber the first (caught by a real test:
        // both ratings claimed to update, but the file only ever showed one change).
        // `PrismaUserStore` updates different rows and wouldn't care either way, so this
        // costs nothing there.
        await this.options.userStore.update({ ...whiteUser, rating: next.white });
        await this.options.userStore.update({ ...blackUser, rating: next.black });
      }
    } catch {
      // Best-effort, same reasoning as reportTournamentResultIfFinished — a rating
      // update failing should never break the room's own move/resign response.
    }
  }

  /** Reports a tournament-linked room's result the moment it finishes with a clear winner — a draw (no resignation, tied score) is left for the existing manual "X won" report, since Damath's rules don't define an automatic tiebreak (docs/DAMATH_RULES.md). */
  private async reportTournamentResultIfFinished(room: RoomHandle, view: PublicGameView): Promise<void> {
    if (!room.tournamentMatch || view.status !== 'finished' || !view.winner) return;
    const winnerUserId = view.winner === 'white' ? view.players.white : view.players.black;
    if (!winnerUserId) return;
    try {
      await this.options.onTournamentMatchFinished?.(room.tournamentMatch, winnerUserId);
    } catch {
      // Best-effort: a rare double-fire or store error shouldn't break the room's own move/resign response.
    }
  }

  private async fallBackToBot(userId: string, variant: AnyVariant): Promise<void> {
    const entry = this.queue.get(userId);
    if (!entry || entry.declined) return;
    this.queue.delete(userId);
    const room = await this.persistAndInstantiateBot(variant, userId);
    this.options.onMatched(userId, 'white', room.getView());
  }

  private scheduleBotReplyIfNeeded(room: RoomHandle): void {
    if (!room.isBotTurn()) return;
    const tier = room.botTier as DifficultyTier;
    setTimeout(() => {
      void (async () => {
        const outcome = await room.applyBotMove();
        if (outcome.ok) {
          this.options.onRoomUpdate(outcome.view);
          this.scheduleBotReplyIfNeeded(room);
        }
      })();
    }, botThinkDelayMs(tier));
  }

  private clearTimer(entry: QueueEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
  }

  private async persistAndInstantiateHuman(
    variant: AnyVariant,
    players: { white: string | null; black: string | null },
    tournamentMatch: TournamentMatchRef | null = null,
  ): Promise<RoomHandle> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const persisted: PersistedGame = {
      id,
      variantId: variant.id,
      players,
      opponentType: 'human',
      botTier: null,
      botNickname: null,
      moveHistory: [],
      status: 'active',
      resignedBy: null,
      drawnByAgreement: false,
      tournamentMatch,
      createdAt: now,
      updatedAt: now,
    };
    await this.options.gameStore.create(persisted);
    const handle = this.instantiateHuman(persisted, variant);
    this.rooms.set(id, handle);
    return handle;
  }

  private async persistAndInstantiateBot(variant: AnyVariant, humanUserId: string, tier: DifficultyTier = this.options.queueBotTier): Promise<RoomHandle> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const persisted: PersistedGame = {
      id,
      variantId: variant.id,
      players: { white: humanUserId, black: BOT_PLAYER_ID },
      opponentType: 'bot',
      botTier: tier,
      botNickname: randomBotNickname(),
      moveHistory: [],
      status: 'active',
      resignedBy: null,
      drawnByAgreement: false,
      tournamentMatch: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.options.gameStore.create(persisted);
    const handle = this.instantiateBot(persisted, variant, tier);
    this.rooms.set(id, handle);
    return handle;
  }

  private hydrate(persisted: PersistedGame): RoomHandle {
    let handle: RoomHandle;
    if (persisted.opponentType === 'bot') {
      const variant = findVariant(persisted.variantId);
      if (!variant) throw new Error(`unknown variant id ${persisted.variantId}`);
      handle = this.instantiateBot(persisted, variant, persisted.botTier ?? this.options.queueBotTier);
    } else {
      const variant = findVariant(persisted.variantId);
      if (!variant) throw new Error(`unknown variant id ${persisted.variantId}`);
      handle = this.instantiateHuman(persisted, variant);
    }
    this.rooms.set(persisted.id, handle);
    return handle;
  }

  private instantiateHuman(persisted: PersistedGame, variant: AnyVariant): RoomHandle {
    type V = ValueOf<AnyVariant>;
    // JSON-boundary cast, same trust point `deserialize`/`GameStore` already use
    // (KNOWLEDGE.md) — `variant` and `persisted.moveHistory` are re-united with a
    // concrete `V` here, and it never escapes past this function.
    return createRoomHandle<V>({
      id: persisted.id,
      variant: variant as Variant<V>,
      players: persisted.players,
      opponentType: 'human',
      botTier: null,
      botNickname: null,
      tournamentMatch: persisted.tournamentMatch,
      initialMoveHistory: persisted.moveHistory as Move<V>[],
      initialResignedBy: persisted.resignedBy,
      initialDrawnByAgreement: persisted.drawnByAgreement,
      onPersist: async (moveHistory, status, resignedBy, drawnByAgreement, players) => {
        await this.options.gameStore.update({
          ...persisted,
          moveHistory,
          status,
          resignedBy,
          drawnByAgreement,
          players,
          updatedAt: new Date().toISOString(),
        });
      },
    });
  }

  private instantiateBot(persisted: PersistedGame, variant: AnyVariant, tier: string): RoomHandle {
    type V = ValueOf<AnyVariant>;
    // Same JSON-boundary trust point as instantiateHuman -- `variant` and
    // `persisted.moveHistory` are re-united with a concrete `V` here.
    return createRoomHandle<V>({
      id: persisted.id,
      variant: variant as Variant<V>,
      players: persisted.players,
      opponentType: 'bot',
      botTier: tier,
      botNickname: persisted.botNickname,
      tournamentMatch: null,
      initialMoveHistory: persisted.moveHistory as Move<V>[],
      initialResignedBy: persisted.resignedBy,
      initialDrawnByAgreement: persisted.drawnByAgreement,
      chooseBotMove: (game) => computeBotMove<V>(game, tier as DifficultyTier),
      onPersist: async (moveHistory, status, resignedBy, drawnByAgreement, players) => {
        await this.options.gameStore.update({
          ...persisted,
          moveHistory,
          status,
          resignedBy,
          drawnByAgreement,
          players,
          updatedAt: new Date().toISOString(),
        });
      },
    });
  }
}
