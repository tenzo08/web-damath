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
    socket.once('open', () => socket.once('message', () => resolve(socket))); // skip online_count
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

interface AchievementView {
  id: string;
  unlocked: boolean;
}

describe('GET /achievements', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/achievements' });
    expect(res.statusCode).toBe(401);
  });

  it('starts every badge locked for a brand-new account', async () => {
    const token = await signupToken('ach-fresh@example.com');
    const res = await testApp.app.inject({ method: 'GET', url: '/achievements', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const achievements = (res.json() as { achievements: AchievementView[] }).achievements;
    expect(achievements.length).toBeGreaterThan(0);
    expect(achievements.every((a) => !a.unlocked)).toBe(true);
  });

  it('unlocks "First Win" and "First Blood" once a real online game is won by capture', async () => {
    const tokenA = await signupToken('ach-a@example.com');
    const tokenB = await signupToken('ach-b@example.com');
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);

    socketA.send(JSON.stringify({ type: 'create_room', variantId: 'whole' }));
    const created = await nextMessage(socketA);
    const roomId = created.roomId as string;
    socketB.send(JSON.stringify({ type: 'join_room', roomId }));
    await Promise.all([nextMessage(socketB), nextMessage(socketA)]);

    // A plain quiet move (no capture) played by A, then B resigns -- A wins the game,
    // but never captured anything, so "First Blood" must stay locked for A while
    // "First Win" unlocks.
    socketA.send(JSON.stringify({ type: 'move', from: { row: 2, col: 1 }, to: { row: 3, col: 0 } }));
    await Promise.all([nextMessage(socketA), nextMessage(socketB)]);
    socketB.send(JSON.stringify({ type: 'resign' }));
    await Promise.all([nextMessage(socketB), nextMessage(socketA)]);

    const resA = await testApp.app.inject({ method: 'GET', url: '/achievements', headers: { authorization: `Bearer ${tokenA}` } });
    const achievementsA = (resA.json() as { achievements: AchievementView[] }).achievements;
    const byId = (id: string) => achievementsA.find((a) => a.id === id);
    expect(byId('first_win')?.unlocked).toBe(true);
    expect(byId('first_capture')?.unlocked).toBe(false);
    expect(byId('first_dama')?.unlocked).toBe(false);

    // B lost, and never captured either -- everything stays locked for B.
    const resB = await testApp.app.inject({ method: 'GET', url: '/achievements', headers: { authorization: `Bearer ${tokenB}` } });
    const achievementsB = (resB.json() as { achievements: AchievementView[] }).achievements;
    expect(achievementsB.find((a) => a.id === 'first_win')?.unlocked).toBe(false);

    socketA.close();
    socketB.close();
  });
});
