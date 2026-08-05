import { randomUUID } from 'node:crypto';
import type { DifficultyTier } from '@damath/ai';
import type { AnyVariant, Move, Player, Variant, VariantId } from '@damath/engine';
import { botThinkDelayMs, computeBotMove } from './bot.js';
import { createRoomHandle, type MoveOutcome, type PublicGameView, type RoomHandle } from './room.js';
import { BOT_PLAYER_ID, type GameStore, type PersistedGame } from './store.js';
import { findIntegerVariant, findVariant } from './variants.js';

type ValueOf<T> = T extends Variant<infer V> ? V : never;

export interface RoomManagerOptions {
  gameStore: GameStore;
  /** docs/AI_OPPONENT.md §9 — environment variables, never hard-coded constants. */
  queueBotTimeoutMs: number;
  queueBotEnabled: boolean;
  queueBotTier: DifficultyTier;
  /** Fires when a room's state changes from something *RoomManager itself* triggered asynchronously (the bot's own move) — a direct caller of `playMove`/`resign` already has the resulting view as its return value and doesn't need this. */
  onRoomUpdate: (view: PublicGameView) => void;
  /** Fires when a queued player is matched by an event they didn't themselves trigger (paired by someone else's `enqueue`, or the bot-fallback timer firing). The player who *called* `enqueue` gets their own match result as that call's return value instead. */
  onMatched: (userId: string, color: Player, view: PublicGameView) => void;
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

  constructor(private readonly options: RoomManagerOptions) {}

  async getRoom(roomId: string): Promise<RoomHandle | null> {
    const active = this.rooms.get(roomId);
    if (active) return active;
    const persisted = await this.options.gameStore.findById(roomId);
    if (!persisted) return null;
    return this.hydrate(persisted);
  }

  /** A direct, invite-link room — the creator sits `white`, `black` waits for `joinRoom`. Distinct from matchmaking. */
  async createRoom(variantId: VariantId, creatorUserId: string): Promise<RoomHandle> {
    const variant = findVariant(variantId);
    if (!variant) throw new Error(`unknown variant id ${variantId}`);
    return this.persistAndInstantiateHuman(variant, { white: creatorUserId, black: null });
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

  /** docs/AI_OPPONENT.md §9. Pairs immediately with another queued player wanting the same variant, else starts a bot-fallback timer (only for AI-supported variants). */
  async enqueue(userId: string, variantId: VariantId): Promise<EnqueueResult> {
    this.cancelQueue(userId);

    for (const [otherUserId, entry] of this.queue) {
      if (otherUserId === userId || entry.variantId !== variantId) continue;
      this.clearTimer(entry);
      this.queue.delete(otherUserId);
      const variant = findVariant(variantId);
      if (!variant) throw new Error(`unknown variant id ${variantId}`);
      const room = await this.persistAndInstantiateHuman(variant, { white: otherUserId, black: userId });
      this.options.onMatched(otherUserId, 'white', room.getView());
      return { status: 'matched', room, color: 'black' };
    }

    const entry: QueueEntry = { userId, variantId, declined: false, timer: null };
    const integerVariant = findIntegerVariant(variantId);
    if (this.options.queueBotEnabled && integerVariant) {
      entry.timer = setTimeout(() => {
        void this.fallBackToBot(userId, integerVariant);
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
    if (outcome.ok) this.scheduleBotReplyIfNeeded(room);
    return outcome;
  }

  async resign(roomId: string, userId: string): Promise<MoveOutcome> {
    const room = await this.getRoom(roomId);
    if (!room) return { ok: false, error: 'room not found' };
    return room.resign(userId);
  }

  private async fallBackToBot(userId: string, variant: Variant<number>): Promise<void> {
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
  ): Promise<RoomHandle> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const persisted: PersistedGame = {
      id,
      variantId: variant.id,
      players,
      opponentType: 'human',
      botTier: null,
      moveHistory: [],
      status: 'active',
      resignedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.options.gameStore.create(persisted);
    const handle = this.instantiateHuman(persisted, variant);
    this.rooms.set(id, handle);
    return handle;
  }

  private async persistAndInstantiateBot(variant: Variant<number>, humanUserId: string): Promise<RoomHandle> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const persisted: PersistedGame = {
      id,
      variantId: variant.id,
      players: { white: humanUserId, black: BOT_PLAYER_ID },
      opponentType: 'bot',
      botTier: this.options.queueBotTier,
      moveHistory: [],
      status: 'active',
      resignedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.options.gameStore.create(persisted);
    const handle = this.instantiateBot(persisted, variant, this.options.queueBotTier);
    this.rooms.set(id, handle);
    return handle;
  }

  private hydrate(persisted: PersistedGame): RoomHandle {
    let handle: RoomHandle;
    if (persisted.opponentType === 'bot') {
      const variant = findIntegerVariant(persisted.variantId);
      if (!variant) throw new Error(`persisted bot room has non-integer variant ${persisted.variantId}`);
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
      initialMoveHistory: persisted.moveHistory as Move<V>[],
      initialResignedBy: persisted.resignedBy,
      onPersist: async (moveHistory, status, resignedBy, players) => {
        await this.options.gameStore.update({ ...persisted, moveHistory, status, resignedBy, players, updatedAt: new Date().toISOString() });
      },
    });
  }

  private instantiateBot(persisted: PersistedGame, variant: Variant<number>, tier: string): RoomHandle {
    return createRoomHandle<number>({
      id: persisted.id,
      variant,
      players: persisted.players,
      opponentType: 'bot',
      botTier: tier,
      initialMoveHistory: persisted.moveHistory as Move<number>[],
      initialResignedBy: persisted.resignedBy,
      chooseBotMove: (game) => computeBotMove(game, tier as DifficultyTier),
      onPersist: async (moveHistory, status, resignedBy, players) => {
        await this.options.gameStore.update({ ...persisted, moveHistory, status, resignedBy, players, updatedAt: new Date().toISOString() });
      },
    });
  }
}
