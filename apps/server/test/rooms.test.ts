import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PublicGameView } from '../src/game/room.js';
import { RoomManager } from '../src/game/rooms.js';
import { FileGameStore, type GameStore } from '../src/game/store.js';
import { FileUserStore, type User, type UserStore } from '../src/auth/store.js';
import { STARTING_RATING } from '../src/rating/elo.js';

/**
 * Real timers, not fake ones: `vi.advanceTimersByTimeAsync` doesn't reliably flush the
 * real `fs/promises` I/O `RoomManager`'s persistence does inside a `setTimeout`
 * callback, so bot-fallback/bot-reply tests poll a real (short) timeout instead.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 10): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition never became true');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

let dir: string;
let gameStore: GameStore;
let userStore: UserStore;
let updates: PublicGameView[];
let matched: { userId: string; color: string; view: PublicGameView }[];

function makeManager(overrides: Partial<{ queueBotTimeoutMs: number; queueBotEnabled: boolean }> = {}) {
  return new RoomManager({
    gameStore,
    userStore,
    queueBotTimeoutMs: overrides.queueBotTimeoutMs ?? 24 * 60 * 60 * 1000,
    queueBotEnabled: overrides.queueBotEnabled ?? true,
    queueBotTier: 'learner',
    onRoomUpdate: (view) => updates.push(view),
    onMatched: (userId, color, view) => matched.push({ userId, color, view }),
  });
}

async function makeUser(id: string, rating = STARTING_RATING): Promise<User> {
  const user: User = { id, email: `${id}@example.com`, passwordHash: 'x', displayName: id, rating, createdAt: new Date().toISOString() };
  await userStore.create(user);
  return user;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'damath-server-rooms-'));
  gameStore = new FileGameStore(path.join(dir, 'games.json'));
  userStore = new FileUserStore(path.join(dir, 'users.json'));
  updates = [];
  matched = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('room creation and joining', () => {
  it('lets a second player join the open seat', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'user-a');
    expect(room.players).toEqual({ white: 'user-a', black: null });

    const joined = await manager.joinRoom(room.id, 'user-b');
    expect(joined).toEqual({ ok: true, room: expect.anything(), color: 'black' });
  });

  it('reconnects the same player to their existing seat without changing it', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'user-a');
    const rejoin = await manager.joinRoom(room.id, 'user-a');
    expect(rejoin).toEqual({ ok: true, room: expect.anything(), color: 'white' });
  });

  it('rejects a third player once both seats are taken', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'user-a');
    await manager.joinRoom(room.id, 'user-b');
    const result = await manager.joinRoom(room.id, 'user-c');
    expect(result).toEqual({ ok: false, error: 'room is full' });
  });

  it('reports an error for an unknown room id', async () => {
    const manager = makeManager();
    const result = await manager.joinRoom('does-not-exist', 'user-a');
    expect(result).toEqual({ ok: false, error: 'room not found' });
  });
});

describe('server-side move validation', () => {
  it('applies a legal move and flips the turn (Whole Damath opening: b3 -> a4)', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    const outcome = await manager.playMove(room.id, 'white-user', { row: 2, col: 1 }, { row: 3, col: 0 });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.view.turn).toBe('black');
      expect(outcome.view.moveCount).toBe(1);
    }
  });

  it('rejects a move that is not in legalMoves(), never trusting the client (PLANNING.md)', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    // (0,0) is not even a playable square — nowhere close to legal.
    const outcome = await manager.playMove(room.id, 'white-user', { row: 2, col: 1 }, { row: 0, col: 0 });
    expect(outcome).toEqual({ ok: false, error: 'illegal move' });
  });

  it("rejects a move attempted out of turn", async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    const outcome = await manager.playMove(room.id, 'black-user', { row: 5, col: 0 }, { row: 4, col: 1 });
    expect(outcome).toEqual({ ok: false, error: 'not your turn' });
  });

  it('rejects a move from someone not seated in the room', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    const outcome = await manager.playMove(room.id, 'a-stranger', { row: 2, col: 1 }, { row: 3, col: 0 });
    expect(outcome).toEqual({ ok: false, error: 'you are not a player in this room' });
  });
});

describe('persistence and reconnection by replay', () => {
  it('reconstructs a room from disk after the in-memory manager is gone (simulated restart)', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');
    await manager.playMove(room.id, 'white-user', { row: 2, col: 1 }, { row: 3, col: 0 });

    // A brand-new manager, same on-disk store — nothing carried over in memory.
    const restarted = makeManager();
    const reloaded = await restarted.getRoom(room.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.getView().moveCount).toBe(1);
    expect(reloaded?.getView().turn).toBe('black');
  });

  it('replays a non-integer variant (Radical Damath) exactly, values included', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('radical', 'white-user');
    await manager.joinRoom(room.id, 'black-user');
    const before = room.getView();

    const restarted = makeManager();
    const reloaded = await restarted.getRoom(room.id);
    expect(reloaded?.getView()).toEqual(before);
  });
});

describe('resign', () => {
  it('ends the game in favour of the opponent and blocks further moves', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    const outcome = await manager.resign(room.id, 'white-user');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.view.status).toBe('finished');
      expect(outcome.view.resignedBy).toBe('white');
    }

    const blocked = await manager.playMove(room.id, 'black-user', { row: 5, col: 0 }, { row: 4, col: 1 });
    expect(blocked).toEqual({ ok: false, error: 'game is over' });
  });
});

describe('matchmaking', () => {
  it('pairs two queued players wanting the same variant immediately', async () => {
    const manager = makeManager();
    const first = await manager.enqueue('user-a', 'integer');
    expect(first).toEqual({ status: 'queued' });

    const second = await manager.enqueue('user-b', 'integer');
    expect(second.status).toBe('matched');
    if (second.status === 'matched') {
      expect(second.color).toBe('black');
      expect(second.room.players).toEqual({ white: 'user-a', black: 'user-b' });
    }

    // The first (already-waiting) player learns about the match asynchronously.
    expect(matched).toHaveLength(1);
    expect(matched[0]).toMatchObject({ userId: 'user-a', color: 'white' });
  });

  it('does not pair players queued for different variants', async () => {
    const manager = makeManager();
    await manager.enqueue('user-a', 'integer');
    const second = await manager.enqueue('user-b', 'whole');
    expect(second).toEqual({ status: 'queued' });
  });

  it('falls back to a bot after the configured timeout for an AI-supported variant', async () => {
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    const result = await manager.enqueue('lonely-user', 'integer');
    expect(result).toEqual({ status: 'queued' });
    expect(matched).toHaveLength(0);

    await waitFor(() => matched.length === 1);

    expect(matched[0]).toMatchObject({ userId: 'lonely-user', color: 'white' });
    expect(matched[0]?.view.opponentType).toBe('bot');
    expect(matched[0]?.view.players.black).toBe('bot');
  });

  it('never falls back to a bot for a variant the AI cannot play', async () => {
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    await manager.enqueue('lonely-user', 'radical');

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(matched).toHaveLength(0);
  });

  it('"keep waiting" (declineBot) cancels the fallback without leaving the queue', async () => {
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    await manager.enqueue('lonely-user', 'integer');
    manager.declineBot('lonely-user');

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(matched).toHaveLength(0);

    // Still queued for a human — a second player still gets paired with them.
    const second = await manager.enqueue('user-b', 'integer');
    expect(second.status).toBe('matched');
  });

  it('cancelQueue removes the player and their pending bot timer entirely', async () => {
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    await manager.enqueue('user-a', 'integer');
    manager.cancelQueue('user-a');

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(matched).toHaveLength(0);

    const second = await manager.enqueue('user-b', 'integer');
    expect(second).toEqual({ status: 'queued' });
    // user-b's own bot-fallback timer is now pending — cancel it so it can't fire
    // during (and pollute) a later test.
    manager.cancelQueue('user-b');
  });
});

describe('the bot opponent', () => {
  it('replies automatically after the human moves, through the same validation path', async () => {
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    await manager.enqueue('human-user', 'integer');
    await waitFor(() => matched.length === 1);
    const roomId = matched[0]?.view.roomId;
    expect(roomId).toBeDefined();

    const room = await manager.getRoom(roomId!);
    expect(room?.opponentType).toBe('bot');

    // Integer Damath's opening has the same first legal move as Whole Damath's fixture used elsewhere.
    const outcome = await manager.playMove(roomId!, 'human-user', { row: 2, col: 1 }, { row: 3, col: 0 });
    expect(outcome.ok).toBe(true);

    // The bot's reply is scheduled, not immediate — docs/AI_OPPONENT.md §9's artificial delay — so it hasn't happened yet.
    expect(updates).toHaveLength(0);
    await waitFor(() => updates.length > 0, 5000);
    expect(updates.at(-1)?.moveCount).toBe(2);
  });
});

describe('rating updates on a finished game', () => {
  it('a human-vs-human resignation raises the winner\'s rating and lowers the loser\'s by the same amount', async () => {
    await makeUser('white-user', 1200);
    await makeUser('black-user', 1200);
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    const outcome = await manager.resign(room.id, 'white-user');
    expect(outcome.ok).toBe(true);

    const white = await userStore.findById('white-user');
    const black = await userStore.findById('black-user');
    expect(white?.rating).toBeLessThan(1200); // resigned -> loss
    expect(black?.rating).toBeGreaterThan(1200); // opponent resigned -> win
    // Equal starting ratings -> zero-sum: exactly symmetric.
    expect(1200 - (white?.rating ?? 0)).toBe((black?.rating ?? 0) - 1200);
  });

  it('never updates the rating of a player not yet seated (still waiting for an opponent)', async () => {
    await makeUser('solo-user', 1200);
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'solo-user');
    // No one has joined the black seat — resigning here would be nonsensical, and
    // isn't reachable through the real client anyway (no Resign button pre-opponent),
    // but this documents that updateRatingsIfFinished never throws or half-updates.
    await manager.resign(room.id, 'solo-user');
    const solo = await userStore.findById('solo-user');
    expect(solo?.rating).toBe(1200);
  });

  it('a human-vs-bot resignation updates the human\'s rating against the bot tier\'s notional rating', async () => {
    await makeUser('human-user', 1200);
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    await manager.enqueue('human-user', 'integer');
    await waitFor(() => matched.length === 1);
    const roomId = matched[0]?.view.roomId;
    expect(roomId).toBeDefined();

    // makeManager's queueBotTier is 'learner' (BOT_TIER_RATING.learner = 800) -- a human
    // starting at 1200 resigning to an 800-rated opponent is a real upset loss, so their
    // rating should drop by more than a routine loss to an equally-rated human would.
    await manager.resign(roomId!, 'human-user');
    const human = await userStore.findById('human-user');
    expect(human?.rating).toBeLessThan(1200);
    expect(1200 - (human?.rating ?? 0)).toBeGreaterThan(15); // a real drop, not a rounding artifact
  });
});
