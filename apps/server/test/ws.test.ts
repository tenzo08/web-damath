import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { makeTestApp, type TestApp } from './helpers.js';

let testApp: TestApp;
let baseUrl: string;

beforeEach(async () => {
  testApp = makeTestApp();
  await testApp.app.listen({ port: 0, host: '127.0.0.1' });
  const address = testApp.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('expected a real TCP address');
  baseUrl = `ws://127.0.0.1:${String(address.port)}`;
});

afterEach(() => testApp.cleanup());

async function signupToken(email: string): Promise<string> {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email, password: 'a-long-enough-password', displayName: email },
  });
  return (res.json() as { token: string }).token;
}

/** Resolves once connected *and* past the connection-time `online_count` message every `/ws` handshake now sends — callers that don't care about it (most of this file) shouldn't need to know it exists. */
function connect(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}/ws?token=${token}`);
    socket.once('open', () => {
      socket.once('message', (raw: Buffer) => {
        const first = JSON.parse(raw.toString()) as { type: string };
        if (first.type !== 'online_count') throw new Error(`expected the first message to be online_count, got ${first.type}`);
        resolve(socket);
      });
    });
    socket.once('error', reject);
  });
}

/** Skips `online_count` broadcasts transparently — they can arrive at any moment as other sockets in the same test connect/disconnect, and are irrelevant noise for every test in this file except the dedicated one below (which uses `waitFor` instead). */
function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    function handler(raw: Buffer) {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (msg.type === 'online_count') return;
      socket.off('message', handler);
      resolve(msg);
    }
    socket.on('message', handler);
  });
}

function waitFor(socket: WebSocket, predicate: (msg: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    function handler(raw: Buffer) {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (predicate(msg)) {
        socket.off('message', handler);
        resolve(msg);
      }
    }
    socket.on('message', handler);
  });
}

describe('the /ws game protocol', () => {
  it('rejects a connection with no token', async () => {
    const socket = new WebSocket(`${baseUrl}/ws`);
    const closed = new Promise<number>((resolve) => socket.once('close', (code: number) => resolve(code)));
    expect(await closed).toBe(4001);
  });

  it('two players create/join a room, exchange a move, and both see the result', async () => {
    const [tokenA, tokenB] = await Promise.all([signupToken('a@example.com'), signupToken('b@example.com')]);
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);

    socketA.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    const created = await nextMessage(socketA);
    expect(created.type).toBe('room_created');
    const roomId = created.roomId as string;

    socketB.send(JSON.stringify({ type: 'join_room', roomId }));
    const [joinedB, notifiedA] = await Promise.all([nextMessage(socketB), nextMessage(socketA)]);
    expect(joinedB).toMatchObject({ type: 'joined', color: 'black' });
    expect((notifiedA as { view: { players: { black: string } } }).view.players.black).toBeDefined();

    socketA.send(JSON.stringify({ type: 'move', from: { row: 2, col: 1 }, to: { row: 3, col: 0 } }));
    const [stateA, stateB] = await Promise.all([nextMessage(socketA), nextMessage(socketB)]);
    expect(stateA.type).toBe('state');
    expect(stateB).toEqual(stateA);
    expect((stateA as { view: { turn: string } }).view.turn).toBe('black');

    socketA.close();
    socketB.close();
  });

  it("rejects an illegal move with an error, and never lets the client dictate the outcome", async () => {
    const token = await signupToken('solo@example.com');
    const socket = await connect(token);

    socket.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    await nextMessage(socket); // room_created

    // No opponent has joined, but the room's creator (white) attempting a move to a
    // square that isn't even playable must still be rejected server-side.
    socket.send(JSON.stringify({ type: 'move', from: { row: 2, col: 1 }, to: { row: 0, col: 0 } }));
    const result = await nextMessage(socket);
    expect(result).toEqual({ type: 'error', message: 'illegal move' });

    socket.close();
  });

  it('a dropped connection can reconnect with a fresh socket and rejoin the same seat, mid-game', async () => {
    const [tokenA, tokenB] = await Promise.all([signupToken('reconnect-a@example.com'), signupToken('reconnect-b@example.com')]);
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);

    socketA.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    const created = await nextMessage(socketA);
    const roomId = created.roomId as string;

    socketB.send(JSON.stringify({ type: 'join_room', roomId }));
    await Promise.all([nextMessage(socketB), nextMessage(socketA)]); // joined / state broadcast

    socketA.send(JSON.stringify({ type: 'move', from: { row: 2, col: 1 }, to: { row: 3, col: 0 } }));
    await Promise.all([nextMessage(socketA), nextMessage(socketB)]); // the move's state broadcast

    // Simulate a network drop: close A's socket with no explicit resignation or
    // "leave room" message, exactly what a WiFi hiccup or a laptop sleeping looks like
    // from the server's perspective — nothing here should end or forfeit the game.
    socketA.close();
    await new Promise((resolve) => socketA.once('close', resolve));

    // A brand-new socket for the same user (what apps/web's useOnlineGame reconnect
    // logic opens automatically) rejoins the room it already has a seat in.
    const reconnectedA = await connect(tokenA);
    // Both listeners must be registered before sending — the server answers `join_room`
    // with two back-to-back messages (a direct `joined`, then a `state` broadcast), and
    // they can both arrive before a *second*, sequentially-attached listener gets a
    // chance to register, silently dropping whichever one arrives first (same reason
    // the join step above uses `Promise.all`, not two sequential awaits).
    const rejoinPromise = nextMessage(reconnectedA);
    const statePromise = waitFor(reconnectedA, (m) => m.type === 'state');
    reconnectedA.send(JSON.stringify({ type: 'join_room', roomId }));
    const [rejoin, state] = await Promise.all([rejoinPromise, statePromise]);
    // Must reclaim the same seat, never "room is full" — rooms.ts's joinRoom returns
    // the existing color for a user already seated, exactly what makes this safe.
    expect(rejoin).toMatchObject({ type: 'joined', color: 'white' });

    // The state must be the live position, not a fresh game — the move played before
    // the drop is still there, and the room never got forfeited/reset by the drop.
    expect((state as { view: { turn: string; moveCount: number } }).view.turn).toBe('black');
    expect((state as { view: { turn: string; moveCount: number } }).view.moveCount).toBe(1);

    reconnectedA.close();
    socketB.close();
  });
});

describe('the online-user count', () => {
  it('broadcasts to everyone as users connect and disconnect, counting each user once regardless of tabs', async () => {
    const [tokenA, tokenB] = await Promise.all([signupToken('online-a@example.com'), signupToken('online-b@example.com')]);
    // connect() already asserts the very first message on each socket is online_count.
    const socketA = await connect(tokenA);

    const nextCountOnA = waitFor(socketA, (m) => m.type === 'online_count');
    const socketB = await connect(tokenB);
    expect(await nextCountOnA).toMatchObject({ count: 2 });

    // A second tab for the same already-online user doesn't change the distinct-user
    // count, so it shouldn't trigger a broadcast to anyone else either.
    const socketA2 = await connect(tokenA);

    const nextCountOnA2 = waitFor(socketA2, (m) => m.type === 'online_count');
    socketB.close();
    expect(await nextCountOnA2).toMatchObject({ count: 1 });

    socketA.close();
    socketA2.close();
  });
});
