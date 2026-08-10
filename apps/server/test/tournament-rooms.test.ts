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

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function signupToken(email: string): Promise<{ token: string; id: string }> {
  const body = await signupUser(testApp, { email, displayName: email });
  return { token: body.token, id: body.user.id };
}

function connect(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}/ws?token=${token}`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
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

type Match = { round: number; index: number; playerA: string | null; playerB: string | null; winner: string | null };

describe('tournament match rooms auto-report their result', () => {
  it('reports the winner to the tournament the moment the linked room finishes, with no manual /result call', async () => {
    const a = await signupToken('roomA@example.com');
    const b = await signupToken('roomB@example.com');

    const create = await testApp.app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: auth(a.token),
      payload: { name: 'Auto-report Cup', variantId: 'integer' },
    });
    const tournament = (create.json() as { tournament: { id: string; joinCode: string } }).tournament;
    await testApp.app.inject({ method: 'POST', url: `/tournaments/join/${tournament.joinCode}`, headers: auth(b.token) });
    await testApp.app.inject({ method: 'POST', url: `/tournaments/${tournament.id}/start`, headers: auth(a.token) });

    const detail = await testApp.app.inject({ method: 'GET', url: `/tournaments/${tournament.id}` });
    const match = ((detail.json() as { tournament: { bracket: { rounds: Match[][] } } }).tournament.bracket.rounds[0] ?? [])[0];
    if (!match?.playerA || !match.playerB) throw new Error('expected a 2-player final with both players seated');
    const whiteToken = match.playerA === a.id ? a.token : b.token;
    const blackToken = match.playerB === b.id ? b.token : a.token;

    const bystander = await signupToken('bystander-room@example.com');
    const forbidden = await testApp.app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/0/room`,
      headers: auth(bystander.token),
    });
    expect(forbidden.statusCode).toBe(403);

    const startRoom = await testApp.app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/0/room`,
      headers: auth(whiteToken),
    });
    expect(startRoom.statusCode).toBe(200);
    const { roomId } = startRoom.json() as { roomId: string };

    // A second "Play this match" click (from either player) must return the same room, not a duplicate.
    const startRoomAgain = await testApp.app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/0/room`,
      headers: auth(blackToken),
    });
    expect((startRoomAgain.json() as { roomId: string }).roomId).toBe(roomId);

    const socketWhite = await connect(whiteToken);
    const socketBlack = await connect(blackToken);
    socketWhite.send(JSON.stringify({ type: 'join_room', roomId }));
    await waitFor(socketWhite, (m) => m.type === 'joined');
    socketBlack.send(JSON.stringify({ type: 'join_room', roomId }));
    await waitFor(socketBlack, (m) => m.type === 'joined');

    const finished = waitFor(socketBlack, (m) => m.type === 'state' && (m.view as { status: string }).status === 'finished');
    socketWhite.send(JSON.stringify({ type: 'resign' }));
    const finalState = await finished;
    expect((finalState.view as { winner: string }).winner).toBe('black');

    const after = await testApp.app.inject({ method: 'GET', url: `/tournaments/${tournament.id}` });
    const afterBody = after.json() as { tournament: { status: string; bracket: { rounds: Match[][] } } };
    const afterMatch = (afterBody.tournament.bracket.rounds[0] ?? [])[0];
    expect(afterMatch?.winner).toBe(match.playerB);
    expect(afterBody.tournament.status).toBe('complete');

    socketWhite.close();
    socketBlack.close();
  });

  it('rejects a room-creation request for a match the requester is not part of, and for one already decided', async () => {
    const a = await signupToken('roomC@example.com');
    const b = await signupToken('roomD@example.com');
    const create = await testApp.app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: auth(a.token),
      payload: { name: 'Cup', variantId: 'integer' },
    });
    const tournament = (create.json() as { tournament: { id: string; joinCode: string } }).tournament;
    await testApp.app.inject({ method: 'POST', url: `/tournaments/join/${tournament.joinCode}`, headers: auth(b.token) });

    const beforeStart = await testApp.app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/0/room`,
      headers: auth(a.token),
    });
    expect(beforeStart.statusCode).toBe(404); // no bracket yet

    await testApp.app.inject({ method: 'POST', url: `/tournaments/${tournament.id}/start`, headers: auth(a.token) });
    await testApp.app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/0/result`,
      headers: auth(a.token),
      payload: { winnerId: a.id },
    });

    const afterDecided = await testApp.app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/0/room`,
      headers: auth(a.token),
    });
    expect(afterDecided.statusCode).toBe(400);
  });
});
