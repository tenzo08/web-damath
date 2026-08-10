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
  const body = await signupUser(testApp, { email, displayName });
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

async function myHistory(token: string): Promise<{ statusCode: number; games: Record<string, unknown>[] }> {
  const res = await testApp.app.inject({ method: 'GET', url: '/games/mine', headers: { authorization: `Bearer ${token}` } });
  return { statusCode: res.statusCode, games: (res.json() as { games: Record<string, unknown>[] }).games ?? [] };
}

describe('GET /games/mine', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/games/mine' });
    expect(res.statusCode).toBe(401);
  });

  it('returns an empty list for a user with no games', async () => {
    const a = await signup('history-empty@example.com', 'Empty');
    const { statusCode, games } = await myHistory(a.token);
    expect(statusCode).toBe(200);
    expect(games).toEqual([]);
  });

  it('lists a finished (resigned) game and an active one, with the result computed relative to the caller', async () => {
    const a = await signup('history-a@example.com', 'PlayerA');
    const b = await signup('history-b@example.com', 'PlayerB');
    const socketA = await connect(a.token);
    const socketB = await connect(b.token);

    // Game 1: A creates, B joins, A resigns -- A should see this as a loss, B as a win.
    socketA.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    const created = await nextMessage(socketA);
    const roomId1 = created.roomId as string;
    socketB.send(JSON.stringify({ type: 'join_room', roomId: roomId1 }));
    await Promise.all([nextMessage(socketB), nextMessage(socketA)]);
    socketA.send(JSON.stringify({ type: 'resign' }));
    await Promise.all([nextMessage(socketA), nextMessage(socketB)]);

    // Game 2: B creates, A joins, one move played -- still active for both.
    socketB.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    const created2 = await nextMessage(socketB);
    const roomId2 = created2.roomId as string;
    socketA.send(JSON.stringify({ type: 'join_room', roomId: roomId2 }));
    await Promise.all([nextMessage(socketA), nextMessage(socketB)]);
    socketB.send(JSON.stringify({ type: 'move', from: { row: 2, col: 1 }, to: { row: 3, col: 0 } }));
    await Promise.all([nextMessage(socketB), nextMessage(socketA)]);

    socketA.close();
    socketB.close();

    const { games: gamesForA } = await myHistory(a.token);
    expect(gamesForA).toHaveLength(2);

    const resignedGame = gamesForA.find((g) => g.id === roomId1);
    expect(resignedGame).toMatchObject({ status: 'finished', result: 'loss', myColor: 'white', opponentName: 'PlayerB' });

    const activeGame = gamesForA.find((g) => g.id === roomId2);
    expect(activeGame).toMatchObject({ status: 'active', result: null, myColor: 'black', moveCount: 1, opponentName: 'PlayerB' });

    const { games: gamesForB } = await myHistory(b.token);
    const resignedGameForB = gamesForB.find((g) => g.id === roomId1);
    expect(resignedGameForB).toMatchObject({ result: 'win', myColor: 'black' });
  });
});
