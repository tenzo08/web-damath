import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, signupUser, type TestApp } from './helpers.js';

let testApp: TestApp;

beforeEach(() => {
  testApp = makeTestApp();
});

afterEach(() => testApp.cleanup());

async function signup(email: string, displayName: string): Promise<{ token: string; id: string }> {
  const body = await signupUser(testApp, { email, displayName });
  return { token: body.token, id: body.user.id };
}

describe('GET /leaderboard', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/leaderboard' });
    expect(res.statusCode).toBe(401);
  });

  it('ranks accounts by rating, highest first, and flags provisional (still-in-placement) accounts', async () => {
    const low = await signup('lead-low@example.com', 'LowRated');
    const high = await signup('lead-high@example.com', 'HighRated');
    const viewer = await signup('lead-viewer@example.com', 'Viewer');

    // Direct store access, same pattern the elo tests use to set up a specific rating
    // without playing real games through — see helpers.ts's `userStore` doc comment.
    const lowUser = await testApp.userStore.findById(low.id);
    const highUser = await testApp.userStore.findById(high.id);
    if (!lowUser || !highUser) throw new Error('expected both signups to exist');
    await testApp.userStore.update({ ...lowUser, rating: 900, placementGamesPlayed: 3 });
    await testApp.userStore.update({ ...highUser, rating: 1800, placementGamesPlayed: 3 });

    const res = await testApp.app.inject({ method: 'GET', url: '/leaderboard', headers: { authorization: `Bearer ${viewer.token}` } });
    expect(res.statusCode).toBe(200);
    const entries = (res.json() as { entries: { id: string; rank: number; rating: number; provisional: boolean }[] }).entries;

    const highEntry = entries.find((e) => e.id === high.id);
    const lowEntry = entries.find((e) => e.id === low.id);
    const viewerEntry = entries.find((e) => e.id === viewer.id);
    expect(highEntry).toBeDefined();
    expect(lowEntry).toBeDefined();
    expect(viewerEntry).toBeDefined();
    // Ranked strictly by rating: high (1800) > viewer (STARTING_RATING, 1200) > low (900).
    expect(highEntry?.rank).toBeLessThan(viewerEntry!.rank);
    expect(viewerEntry?.rank).toBeLessThan(lowEntry!.rank);
    expect(highEntry?.provisional).toBe(false);
    expect(viewerEntry?.provisional).toBe(true); // 0 placement games played yet
  });

  it('caps the result at the requested limit', async () => {
    const a = await signup('lead-cap-a@example.com', 'CapA');
    await signup('lead-cap-b@example.com', 'CapB');
    await signup('lead-cap-c@example.com', 'CapC');

    const res = await testApp.app.inject({ method: 'GET', url: '/leaderboard?limit=2', headers: { authorization: `Bearer ${a.token}` } });
    const entries = (res.json() as { entries: unknown[] }).entries;
    expect(entries.length).toBe(2);
  });
});
