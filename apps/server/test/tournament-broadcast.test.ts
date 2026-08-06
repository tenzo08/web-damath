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

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function signupToken(email: string): Promise<{ token: string; id: string }> {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email, password: 'a-long-enough-password', displayName: email },
  });
  const body = res.json() as { token: string; user: { id: string } };
  return { token: body.token, id: body.user.id };
}

function connect(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}/ws?token=${token}`);
    socket.once('open', () => {
      // Every fresh connection's first message is its own online_count — not what this
      // file cares about, just drained before handing the socket back.
      socket.once('message', () => resolve(socket));
    });
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

describe('tournaments broadcast live updates over /ws', () => {
  it('pushes tournament_updated to a connected client on create, join, and start — no refresh needed', async () => {
    const creator = await signupToken('bcast-creator@example.com');
    const watcher = await signupToken('bcast-watcher@example.com');
    // The watcher is just present online (e.g. sitting on the Tournaments screen) —
    // never a participant, never calls a tournament route directly — and should still
    // see every change live, since the broadcast goes to every connected user.
    const watcherSocket = await connect(watcher.token);

    const createBroadcast = waitFor(watcherSocket, (m) => m.type === 'tournament_updated');
    const create = await testApp.app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: auth(creator.token),
      payload: { name: 'Live Cup', variantId: 'integer' },
    });
    const tournamentId = (create.json() as { tournament: { id: string } }).tournament.id;
    const created = (await createBroadcast) as { tournament: { id: string; status: string } };
    expect(created.tournament.id).toBe(tournamentId);
    expect(created.tournament.status).toBe('lobby');

    const joinBroadcast = waitFor(watcherSocket, (m) => m.type === 'tournament_updated');
    const joinerToken = (await signupToken('bcast-joiner@example.com')).token;
    const joinCode = (create.json() as { tournament: { joinCode: string } }).tournament.joinCode;
    await testApp.app.inject({ method: 'POST', url: `/tournaments/join/${joinCode}`, headers: auth(joinerToken) });
    const joined = (await joinBroadcast) as { tournament: { participants: string[] } };
    expect(joined.tournament.participants).toHaveLength(2);

    const startBroadcast = waitFor(watcherSocket, (m) => m.type === 'tournament_updated');
    await testApp.app.inject({ method: 'POST', url: `/tournaments/${tournamentId}/start`, headers: auth(creator.token) });
    const started = (await startBroadcast) as { tournament: { status: string } };
    expect(started.tournament.status).toBe('in_progress');

    watcherSocket.close();
  });
});
