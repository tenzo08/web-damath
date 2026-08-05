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

function connect(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}/ws?token=${token}`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    socket.once('message', (raw: Buffer) => resolve(JSON.parse(raw.toString()) as Record<string, unknown>));
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
});
