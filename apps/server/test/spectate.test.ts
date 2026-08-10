import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { makeTestApp, signupUser, type TestApp } from './helpers.js';

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

async function signup(email: string, displayName: string): Promise<{ token: string; id: string }> {
  const body = await signupUser(testApp, { email, password: 'a-long-enough-password', displayName });
  return { token: body.token, id: body.user.id };
}

function connect(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}/ws?token=${token}`);
    socket.once('open', () => {
      socket.once('message', () => resolve(socket)); // skip the initial online_count
    });
    socket.once('error', reject);
  });
}

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

describe('GET /games/live', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/games/live' });
    expect(res.statusCode).toBe(401);
  });

  it('lists an in-progress human-vs-human game with resolved player names', async () => {
    const a = await signup('live-a@example.com', 'LiveA');
    const b = await signup('live-b@example.com', 'LiveB');
    const socketA = await connect(a.token);
    const socketB = await connect(b.token);

    socketA.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    const created = await nextMessage(socketA);
    const roomId = created.roomId as string;
    socketB.send(JSON.stringify({ type: 'join_room', roomId }));
    await Promise.all([nextMessage(socketB), nextMessage(socketA)]);

    const viewer = await signup('live-viewer@example.com', 'Viewer');
    const res = await testApp.app.inject({ method: 'GET', url: '/games/live', headers: { authorization: `Bearer ${viewer.token}` } });
    expect(res.statusCode).toBe(200);
    const games = (res.json() as { games: Record<string, unknown>[] }).games;
    const entry = games.find((g) => g.id === roomId);
    expect(entry).toMatchObject({ variantId: 'whole', whiteName: 'LiveA', blackName: 'LiveB', moveCount: 0 });

    socketA.close();
    socketB.close();
  });

  it('excludes a game once it finishes', async () => {
    const a = await signup('livefin-a@example.com', 'FinA');
    const b = await signup('livefin-b@example.com', 'FinB');
    const socketA = await connect(a.token);
    const socketB = await connect(b.token);

    socketA.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    const created = await nextMessage(socketA);
    const roomId = created.roomId as string;
    socketB.send(JSON.stringify({ type: 'join_room', roomId }));
    await Promise.all([nextMessage(socketB), nextMessage(socketA)]);
    socketA.send(JSON.stringify({ type: 'resign' }));
    await Promise.all([nextMessage(socketA), nextMessage(socketB)]);

    const res = await testApp.app.inject({ method: 'GET', url: '/games/live', headers: { authorization: `Bearer ${a.token}` } });
    const games = (res.json() as { games: Record<string, unknown>[] }).games;
    expect(games.find((g) => g.id === roomId)).toBeUndefined();

    socketA.close();
    socketB.close();
  });
});

describe('the /ws spectate action', () => {
  it('lets a third socket watch a room without taking a seat, and receive its move broadcasts', async () => {
    const a = await signup('spec-a@example.com', 'SpecA');
    const b = await signup('spec-b@example.com', 'SpecB');
    const c = await signup('spec-c@example.com', 'SpecC');
    const socketA = await connect(a.token);
    const socketB = await connect(b.token);
    const socketC = await connect(c.token);

    socketA.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    const created = await nextMessage(socketA);
    const roomId = created.roomId as string;
    socketB.send(JSON.stringify({ type: 'join_room', roomId }));
    await Promise.all([nextMessage(socketB), nextMessage(socketA)]);

    socketC.send(JSON.stringify({ type: 'spectate', roomId }));
    const spectating = await nextMessage(socketC);
    expect(spectating).toMatchObject({ type: 'spectating', roomId });
    expect((spectating as { view: { players: { white: string; black: string } } }).view.players).toEqual({ white: a.id, black: b.id });

    const movePromise = nextMessage(socketC);
    socketA.send(JSON.stringify({ type: 'move', from: { row: 2, col: 1 }, to: { row: 3, col: 0 } }));
    await Promise.all([nextMessage(socketA), nextMessage(socketB)]);
    const spectatorSawMove = await movePromise;
    expect((spectatorSawMove as { view: { turn: string } }).view.turn).toBe('black');

    // A spectator was never assigned a seat, so an attempted move is rejected exactly
    // like any other non-player's would be -- never silently accepted.
    socketC.send(JSON.stringify({ type: 'move', from: { row: 5, col: 0 }, to: { row: 4, col: 1 } }));
    const rejected = await nextMessage(socketC);
    expect(rejected).toEqual({ type: 'error', message: 'you are not a player in this room' });

    socketA.close();
    socketB.close();
    socketC.close();
  });

  it('reports an error for a nonexistent room', async () => {
    const a = await signup('spec-solo@example.com', 'SpecSolo');
    const socketA = await connect(a.token);
    socketA.send(JSON.stringify({ type: 'spectate', roomId: 'does-not-exist' }));
    const result = await nextMessage(socketA);
    expect(result).toEqual({ type: 'error', message: 'room not found' });
    socketA.close();
  });
});
