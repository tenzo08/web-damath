import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { GoogleIdTokenPayload, GoogleIdTokenVerifier } from '../src/auth/routes.js';
import { makeTestApp, signupUser, type TestApp } from './helpers.js';

const GOOGLE_CLIENT_ID = 'test-google-client-id';

/** Never a real network call to Google -- a canned lookup by the fake "idToken" each test passes, standing in for a signed JWT Google would otherwise have issued. */
const FAKE_TOKENS: Record<string, GoogleIdTokenPayload | null> = {
  'valid-new-user': { sub: 'google-sub-1', email: 'newperson@example.com', email_verified: true, name: 'New Person' },
  'valid-existing-email': { sub: 'google-sub-2', email: 'teacher@example.com', email_verified: true, name: 'Ms. Cruz (Google)' },
  'unverified-email': { sub: 'google-sub-3', email: 'sneaky@example.com', email_verified: false, name: 'Sneaky' },
  garbage: null,
};

const stubVerifier: GoogleIdTokenVerifier = (idToken) => Promise.resolve(FAKE_TOKENS[idToken] ?? null);

let testApp: TestApp;
let app: FastifyInstance;

beforeEach(() => {
  testApp = makeTestApp({ googleClientId: GOOGLE_CLIENT_ID, googleVerifier: stubVerifier });
  app = testApp.app;
});

afterEach(() => testApp.cleanup());

async function googleAuth(idToken: string) {
  return app.inject({ method: 'POST', url: '/auth/google', payload: { idToken } });
}

describe('POST /auth/google', () => {
  it('returns 501 when Google sign-in is not configured on this server', async () => {
    const unconfigured = makeTestApp();
    const res = await unconfigured.app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: 'valid-new-user' } });
    expect(res.statusCode).toBe(501);
    await unconfigured.cleanup();
  });

  it('rejects an invalid/unverifiable credential', async () => {
    const res = await googleAuth('garbage');
    expect(res.statusCode).toBe(401);
  });

  it("rejects a Google account whose email Google itself hasn't verified", async () => {
    const res = await googleAuth('unverified-email');
    expect(res.statusCode).toBe(401);
  });

  it('a brand-new Google identity gets a pending-signup token, not an account yet', async () => {
    const res = await googleAuth('valid-new-user');
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pending: boolean; pendingToken: string; email: string; suggestedName: string };
    expect(body.pending).toBe(true);
    expect(body.email).toBe('newperson@example.com');
    expect(body.suggestedName).toBe('New Person');
    expect(typeof body.pendingToken).toBe('string');
  });

  it('auto-links an existing (non-Google-linked) account the first time it signs in with a matching Google email', async () => {
    await signupUser(testApp, { email: 'teacher@example.com', displayName: 'Ms. Cruz' });

    const res = await googleAuth('valid-existing-email');
    expect(res.statusCode).toBe(200);
    const body = res.json() as { token: string; user: { email: string; displayName: string; emailVerified: boolean } };
    expect(body.token).toBeTypeOf('string');
    expect(body.user.email).toBe('teacher@example.com');
    expect(body.user.displayName).toBe('Ms. Cruz'); // the account's own nickname, not Google's suggested name
    expect(body.user.emailVerified).toBe(true); // Google's own verification counts
  });

  it('logs straight in on a second Google sign-in, once the identity is already linked', async () => {
    const first = await googleAuth('valid-new-user');
    const { pendingToken } = first.json() as { pendingToken: string };
    const completed = await app.inject({
      method: 'POST',
      url: '/auth/google/complete',
      payload: { pendingToken, displayName: 'Newbie' },
    });
    const firstUserId = (completed.json() as { user: { id: string } }).user.id;

    const second = await googleAuth('valid-new-user');
    expect(second.statusCode).toBe(200);
    const body = second.json() as { user: { id: string } };
    expect(body.user.id).toBe(firstUserId);
  });
});

describe('POST /auth/google/complete', () => {
  async function getPendingToken(idToken = 'valid-new-user'): Promise<string> {
    const res = await googleAuth(idToken);
    return (res.json() as { pendingToken: string }).pendingToken;
  }

  it('creates a real account, email pre-verified via Google', async () => {
    const pendingToken = await getPendingToken();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/google/complete',
      payload: { pendingToken, displayName: 'Newbie' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { token: string; user: { displayName: string; email: string; emailVerified: boolean } };
    expect(body.token).toBeTypeOf('string');
    expect(body.user.displayName).toBe('Newbie');
    expect(body.user.email).toBe('newperson@example.com');
    expect(body.user.emailVerified).toBe(true);

    // The token really works -- a follow-up authenticated request succeeds.
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${body.token}` } });
    expect(me.statusCode).toBe(200);
  });

  it('rejects a garbage or expired pending token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/google/complete',
      payload: { pendingToken: 'not-a-real-token', displayName: 'Newbie' },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a normal session token used as if it were a pending token (can't be replayed)", async () => {
    const { token } = await signupUser(testApp, { email: 'real-account@example.com', displayName: 'Real Account' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/google/complete',
      payload: { pendingToken: token, displayName: 'Hijacked' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a nickname already taken by someone else', async () => {
    await signupUser(testApp, { email: 'other@example.com', displayName: 'Taken Name' });
    const pendingToken = await getPendingToken();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/google/complete',
      payload: { pendingToken, displayName: 'taken name' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects completion if the email was claimed by someone else in the meantime', async () => {
    const pendingToken = await getPendingToken();
    // Someone else signs up with the same email directly, in the window before completion.
    await signupUser(testApp, { email: 'newperson@example.com', displayName: 'Got There First' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/google/complete',
      payload: { pendingToken, displayName: 'Newbie' },
    });
    expect(res.statusCode).toBe(409);
  });
});
