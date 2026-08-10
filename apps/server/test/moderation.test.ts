import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLACEMENT_GAMES_REQUIRED } from '../src/rating/elo.js';
import { makeTestApp, signupUser, type TestApp } from './helpers.js';

let testApp: TestApp;

beforeEach(() => {
  testApp = makeTestApp();
});

afterEach(() => testApp.cleanup());

async function signup(email: string, displayName: string): Promise<{ token: string; id: string }> {
  const body = await signupUser(testApp, { email, password: 'a-long-enough-password', displayName });
  return { token: body.token, id: body.user.id };
}

describe('POST /reports', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await testApp.app.inject({ method: 'POST', url: '/reports', payload: { reportedUserId: 'x', reason: 'y' } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects reporting yourself', async () => {
    const a = await signup('rep-a@example.com', 'RepA');
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/reports',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { reportedUserId: a.id, reason: 'testing' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a report against another user', async () => {
    const a = await signup('rep-b@example.com', 'RepB');
    const b = await signup('rep-c@example.com', 'RepC');
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/reports',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { reportedUserId: b.id, reason: 'abusive chat', roomId: 'some-room' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects a blank reason', async () => {
    const a = await signup('rep-d@example.com', 'RepD');
    const b = await signup('rep-e@example.com', 'RepE');
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/reports',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { reportedUserId: b.id, reason: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('blocking', () => {
  it('rejects blocking yourself', async () => {
    const a = await signup('blk-a@example.com', 'BlkA');
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/blocks',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { blockedUserId: a.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks, lists, and unblocks a user', async () => {
    const a = await signup('blk-b@example.com', 'BlkB');
    const b = await signup('blk-c@example.com', 'BlkC');

    const block = await testApp.app.inject({
      method: 'POST',
      url: '/blocks',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { blockedUserId: b.id },
    });
    expect(block.statusCode).toBe(201);

    const list = await testApp.app.inject({ method: 'GET', url: '/blocks/mine', headers: { authorization: `Bearer ${a.token}` } });
    expect(list.statusCode).toBe(200);
    const blocked = (list.json() as { blocked: { userId: string; displayName: string | null }[] }).blocked;
    expect(blocked).toEqual([expect.objectContaining({ userId: b.id, displayName: 'BlkC' })]);

    const unblock = await testApp.app.inject({ method: 'DELETE', url: `/blocks/${b.id}`, headers: { authorization: `Bearer ${a.token}` } });
    expect(unblock.statusCode).toBe(200);

    const listAfter = await testApp.app.inject({ method: 'GET', url: '/blocks/mine', headers: { authorization: `Bearer ${a.token}` } });
    expect((listAfter.json() as { blocked: unknown[] }).blocked).toEqual([]);
  });

  it('never pairs two queued players when either has blocked the other', async () => {
    const a = await signup('blk-queue-a@example.com', 'QueueA');
    const b = await signup('blk-queue-b@example.com', 'QueueB');
    const c = await signup('blk-queue-c@example.com', 'QueueC');
    // This test is about blocking, not placement (rating/elo.ts) -- a fresh account's
    // placement window would otherwise route `enqueue` straight to a bot instead of the
    // human queue this test actually exercises.
    for (const { id } of [a, b, c]) {
      const user = await testApp.userStore.findById(id);
      if (user) await testApp.userStore.update({ ...user, placementGamesPlayed: PLACEMENT_GAMES_REQUIRED });
    }

    await testApp.app.inject({
      method: 'POST',
      url: '/blocks',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { blockedUserId: b.id },
    });

    // A and B are queued for the same variant with a block between them -- they must
    // NOT be paired together; C (unblocked) queuing next should pair with whichever of
    // A/B is still waiting. `roomManager` is decorated inside `app.after(...)`, which
    // only resolves once the app is actually ready -- `.inject()` calls above trigger
    // that implicitly, but a direct property access here needs it awaited explicitly.
    await testApp.app.ready();
    const roomManager = testApp.app.roomManager;
    const first = await roomManager.enqueue(a.id, 'integer');
    expect(first).toEqual({ status: 'queued' });
    const second = await roomManager.enqueue(b.id, 'integer');
    expect(second).toEqual({ status: 'queued' });

    const third = await roomManager.enqueue(c.id, 'integer');
    expect(third.status).toBe('matched');
    if (third.status === 'matched') {
      // Paired with whichever of A/B was queued first (A), never rejected outright --
      // the block only prevents A<->B specifically, not A or B pairing with anyone else.
      expect(third.room.players.white).toBe(a.id);
    }
  });
});
