import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PublicGameView } from '../src/game/room.js';
import { RoomManager } from '../src/game/rooms.js';
import { BOT_NICKNAMES } from '../src/game/botNames.js';
import { FileGameStore, type GameStore } from '../src/game/store.js';
import { FileUserStore, type User, type UserStore } from '../src/auth/store.js';
import { FileModerationStore, type ModerationStore } from '../src/moderation/store.js';
import { PLACEMENT_GAMES_REQUIRED, STARTING_RATING } from '../src/rating/elo.js';

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
let moderationStore: ModerationStore;
let updates: PublicGameView[];
let matched: { userId: string; color: string; view: PublicGameView }[];

function makeManager(overrides: Partial<{ queueBotTimeoutMs: number; queueBotEnabled: boolean }> = {}) {
  return new RoomManager({
    gameStore,
    userStore,
    moderationStore,
    queueBotTimeoutMs: overrides.queueBotTimeoutMs ?? 24 * 60 * 60 * 1000,
    queueBotEnabled: overrides.queueBotEnabled ?? true,
    queueBotTier: 'learner',
    onRoomUpdate: (view) => updates.push(view),
    onMatched: (userId, color, view) => matched.push({ userId, color, view }),
  });
}

/**
 * `placementGamesPlayed` defaults past the threshold (not 0) -- most of this file's
 * tests are about matchmaking/room mechanics, not placement, and a fresh account's
 * placement window would otherwise route `enqueue` straight to a bot in every one of
 * them. Tests that specifically exercise placement pass `placementGamesPlayed: 0`.
 */
async function makeUser(id: string, rating = STARTING_RATING, placementGamesPlayed = PLACEMENT_GAMES_REQUIRED): Promise<User> {
  const user: User = {
    id,
    email: `${id}@example.com`,
    passwordHash: 'x',
    displayName: id,
    rating,
    avatarEmoji: null,
    emailVerified: false,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    verifyTokenHash: null,
    verifyTokenExpiresAt: null,
    googleId: null,
    placementGamesPlayed,
    createdAt: new Date().toISOString(),
  };
  await userStore.create(user);
  return user;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'damath-server-rooms-'));
  gameStore = new FileGameStore(path.join(dir, 'games.json'));
  userStore = new FileUserStore(path.join(dir, 'users.json'));
  moderationStore = new FileModerationStore(path.join(dir, 'reports.json'), path.join(dir, 'blocks.json'));
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

describe('draw offers', () => {
  it('ends the game as a real draw once the opponent accepts, regardless of the current score', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    const offer = await manager.offerDraw(room.id, 'white-user');
    expect(offer.ok).toBe(true);
    if (offer.ok) expect(offer.view.drawOfferedBy).toBe('white');

    const response = await manager.respondDraw(room.id, 'black-user', true);
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.view.status).toBe('finished');
      expect(response.view.winner).toBeNull();
      expect(response.view.resignedBy).toBeNull();
      expect(response.view.drawOfferedBy).toBeNull();
    }

    const blocked = await manager.playMove(room.id, 'white-user', { row: 2, col: 1 }, { row: 3, col: 0 });
    expect(blocked).toEqual({ ok: false, error: 'game is over' });
  });

  it('clears the offer without ending the game when declined, and play continues normally', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    await manager.offerDraw(room.id, 'white-user');
    const declined = await manager.respondDraw(room.id, 'black-user', false);
    expect(declined.ok).toBe(true);
    if (declined.ok) {
      expect(declined.view.status).toBe('active');
      expect(declined.view.drawOfferedBy).toBeNull();
    }

    const move = await manager.playMove(room.id, 'white-user', { row: 2, col: 1 }, { row: 3, col: 0 });
    expect(move.ok).toBe(true);
  });

  it('is implicitly cancelled by either side making a move', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    await manager.offerDraw(room.id, 'white-user');
    const afterMove = await manager.playMove(room.id, 'white-user', { row: 2, col: 1 }, { row: 3, col: 0 });
    expect(afterMove.ok).toBe(true);
    if (afterMove.ok) expect(afterMove.view.drawOfferedBy).toBeNull();

    const staleResponse = await manager.respondDraw(room.id, 'black-user', true);
    expect(staleResponse).toEqual({ ok: false, error: 'no draw offer is pending' });
  });

  it('rejects a response from the player who made the offer', async () => {
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    await manager.offerDraw(room.id, 'white-user');
    const result = await manager.respondDraw(room.id, 'white-user', true);
    expect(result).toEqual({ ok: false, error: 'you cannot respond to your own draw offer' });
  });

  it('rejects a draw offer against the computer opponent', async () => {
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    await manager.enqueue('lonely-user', 'integer');
    await waitFor(() => matched.length === 1);
    const botRoomId = matched[0]?.view.roomId;
    if (!botRoomId) throw new Error('expected a bot room to have been created');

    const outcome = await manager.offerDraw(botRoomId, 'lonely-user');
    expect(outcome).toEqual({ ok: false, error: 'the computer opponent does not accept draw offers' });
  });

  it('updates ratings for both players when a draw is agreed, same as any other finish', async () => {
    await makeUser('white-user');
    await makeUser('black-user');
    const manager = makeManager();
    const room = await manager.createRoom('whole', 'white-user');
    await manager.joinRoom(room.id, 'black-user');

    await manager.offerDraw(room.id, 'white-user');
    await manager.respondDraw(room.id, 'black-user', true);

    const white = await userStore.findById('white-user');
    const black = await userStore.findById('black-user');
    // Equal-rated players drawing shouldn't move either rating at all.
    expect(white?.rating).toBe(STARTING_RATING);
    expect(black?.rating).toBe(STARTING_RATING);
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

  it('also falls back to a bot for a non-integer variant (valueScale.ts extends the AI to every variant)', async () => {
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    const result = await manager.enqueue('lonely-user', 'radical');
    expect(result).toEqual({ status: 'queued' });
    expect(matched).toHaveLength(0);

    await waitFor(() => matched.length === 1);

    expect(matched[0]).toMatchObject({ userId: 'lonely-user', color: 'white' });
    expect(matched[0]?.view.opponentType).toBe('bot');
    expect(matched[0]?.view.players.black).toBe('bot');
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

  it('gets a friendly nickname, never "Computer" or the tier, even though opponentType/botTier still track the real fact', async () => {
    const manager = makeManager({ queueBotTimeoutMs: 20 });
    await manager.enqueue('human-user', 'integer');
    await waitFor(() => matched.length === 1);
    const view = matched[0]?.view;
    expect(view?.opponentType).toBe('bot'); // still tracked accurately internally
    expect(BOT_NICKNAMES).toContain(view?.botNickname);
    expect(view?.botNickname).not.toMatch(/computer/i);
    expect(view?.botNickname).not.toBe(view?.botTier);
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

describe('placement games (rating/elo.ts PLACEMENT_GAMES_REQUIRED)', () => {
  it('routes a still-in-placement account straight to a bot, skipping the human queue entirely', async () => {
    await makeUser('new-user', 1200, 0);
    await makeUser('waiting-human', 1200); // already past placement, genuinely waiting for a human
    const manager = makeManager({ queueBotTimeoutMs: 24 * 60 * 60 * 1000 }); // effectively never fires on its own

    await manager.enqueue('waiting-human', 'integer');
    const result = await manager.enqueue('new-user', 'integer');

    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.room.opponentType).toBe('bot');
      expect(result.room.botTier).toBe('steady'); // PLACEMENT_TIER, not makeManager's own queueBotTier ('learner')
      expect(result.room.players.white).toBe('new-user');
    }
    // The waiting human was never touched by this -- still queued, not paired with the placement account.
    expect(matched).toHaveLength(0);
  });

  it('finishing a placement game increments placementGamesPlayed', async () => {
    await makeUser('new-user', 1200, 0);
    const manager = makeManager();
    const result = await manager.enqueue('new-user', 'integer');
    if (result.status !== 'matched') throw new Error('expected an immediate bot match');

    await manager.resign(result.room.id, 'new-user');
    const user = await userStore.findById('new-user');
    expect(user?.placementGamesPlayed).toBe(1);
  });

  it('a placement-window loss swings rating further than the same loss would post-placement (boosted K-factor)', async () => {
    await makeUser('placement-user', 1200, 0);
    await makeUser('graduated-user', 1200, PLACEMENT_GAMES_REQUIRED);
    const manager = makeManager({ queueBotTimeoutMs: 20 });

    const placementResult = await manager.enqueue('placement-user', 'integer');
    if (placementResult.status !== 'matched') throw new Error('expected an immediate bot match for the placement account');

    // graduated-user is past placement -- enqueue queues normally and only reaches a
    // bot after the fallback timeout, same path the existing "human-vs-bot resignation"
    // test above already exercises.
    const graduatedQueued = await manager.enqueue('graduated-user', 'integer');
    expect(graduatedQueued).toEqual({ status: 'queued' });
    await waitFor(() => matched.length === 1);
    const graduatedRoomId = matched[0]?.view.roomId;
    expect(graduatedRoomId).toBeDefined();

    await manager.resign(placementResult.room.id, 'placement-user');
    await manager.resign(graduatedRoomId!, 'graduated-user');

    const placementDrop = 1200 - ((await userStore.findById('placement-user'))?.rating ?? 0);
    const graduatedDrop = 1200 - ((await userStore.findById('graduated-user'))?.rating ?? 0);
    expect(placementDrop).toBeGreaterThan(graduatedDrop);
  });

  it('enqueue behaves normally again once placementGamesPlayed reaches the threshold', async () => {
    await makeUser('done-user', 1200, PLACEMENT_GAMES_REQUIRED);
    const manager = makeManager({ queueBotTimeoutMs: 24 * 60 * 60 * 1000 });

    const result = await manager.enqueue('done-user', 'integer');
    expect(result).toEqual({ status: 'queued' });
  });
});
