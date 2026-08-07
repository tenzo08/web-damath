import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, type TestApp } from './helpers.js';

let testApp: TestApp;
let app: FastifyInstance;

beforeEach(() => {
  testApp = makeTestApp();
  app = testApp.app;
});

afterEach(() => testApp.cleanup());

const CREDENTIALS = { email: 'Teacher@Example.com', password: 'hunter22222', displayName: 'Ms. Cruz' };

async function signup(overrides: Partial<typeof CREDENTIALS> = {}) {
  return app.inject({ method: 'POST', url: '/auth/signup', payload: { ...CREDENTIALS, ...overrides } });
}

describe('POST /auth/signup', () => {
  it('creates an account and returns a token plus the public user, never the password hash', async () => {
    const res = await signup();
    expect(res.statusCode).toBe(201);
    const body = res.json() as { token: string; user: Record<string, unknown> };
    expect(typeof body.token).toBe('string');
    expect(body.user.email).toBe('teacher@example.com'); // normalised to lowercase
    expect(body.user.displayName).toBe('Ms. Cruz');
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('rejects a second signup with the same email (case-insensitively)', async () => {
    await signup();
    const res = await signup({ email: 'teacher@example.com' });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a second signup with the same nickname, case-insensitively', async () => {
    await signup();
    const res = await signup({ email: 'someone-else@example.com', displayName: 'ms. cruz' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/nickname/i);
  });

  it('rejects a malformed email', async () => {
    const res = await signup({ email: 'not-an-email' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await signup({ password: 'short' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('succeeds with the correct email and password and returns a usable token', async () => {
    await signup();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTypeOf('string');
  });

  it('fails with the wrong password', async () => {
    await signup();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: CREDENTIALS.email, password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('fails for an email that was never registered', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: CREDENTIALS.password },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a garbage bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: 'Bearer not-a-real-token' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns the authenticated user for a token issued by signup', async () => {
    const signupRes = await signup();
    const { token } = signupRes.json() as { token: string };

    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('teacher@example.com');
  });

  it('starts with no avatar — the default initial-letter circle, not a random pick', async () => {
    const signupRes = await signup();
    expect(signupRes.json().user.avatarEmoji).toBeNull();
  });
});

describe('PATCH /auth/me', () => {
  async function signupAndGetToken(): Promise<string> {
    const res = await signup();
    return (res.json() as { token: string }).token;
  }

  it('rejects a request with no bearer token', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/auth/me', payload: { displayName: 'New Name' } });
    expect(res.statusCode).toBe(401);
  });

  it('updates the display name', async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.displayName).toBe('New Name');

    // Persisted, not just echoed back — a fresh /auth/me confirms it actually saved.
    const meRes = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(meRes.json().user.displayName).toBe('New Name');
  });

  it('rejects a blank display name', async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a recognised avatar emoji and persists it', async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarEmoji: '🦁' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.avatarEmoji).toBe('🦁');
  });

  it("rejects an avatar value that isn't in the fixed allow-list — never an arbitrary client string", async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarEmoji: '<script>alert(1)</script>' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('clears the avatar back to the default when set to null', async () => {
    const token = await signupAndGetToken();
    await app.inject({ method: 'PATCH', url: '/auth/me', headers: { authorization: `Bearer ${token}` }, payload: { avatarEmoji: '🦁' } });
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarEmoji: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.avatarEmoji).toBeNull();
  });

  // A real (if tiny) 1×1 transparent PNG — the validator (auth/avatars.ts) checks the
  // data URL's shape and decoded byte size, not that it's a decodable image, but using
  // a genuine one here keeps the test honest about what a real upload looks like.
  const TINY_PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  it('accepts a real uploaded profile picture and persists it, taking priority alongside the emoji field', async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarImage: TINY_PNG_DATA_URL },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.avatarImage).toBe(TINY_PNG_DATA_URL);
  });

  it('rejects a value that is not a data: image URL', async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarImage: 'https://example.com/not-a-data-url.png' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an image over the size cap', async () => {
    const token = await signupAndGetToken();
    // ~450,000 base64 chars decodes to well over MAX_AVATAR_IMAGE_BYTES (300,000).
    const oversized = `data:image/png;base64,${'A'.repeat(450_000)}`;
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarImage: oversized },
    });
    expect(res.statusCode).toBe(400);
  });

  it('clears the uploaded picture back to null, independently of the emoji field', async () => {
    const token = await signupAndGetToken();
    await app.inject({ method: 'PATCH', url: '/auth/me', headers: { authorization: `Bearer ${token}` }, payload: { avatarImage: TINY_PNG_DATA_URL } });
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarImage: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.avatarImage).toBeNull();
  });

  it('rejects changing to a nickname another account already has, case-insensitively', async () => {
    await signup({ email: 'other@example.com', displayName: 'Taken Name' });
    const token = await signupAndGetToken();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'taken name' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/nickname/i);
  });

  it('allows re-saving your own current name with different casing (not a conflict with yourself)', async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'MS. CRUZ' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.displayName).toBe('MS. CRUZ');
  });

  it('leaves fields unset in the request untouched', async () => {
    const token = await signupAndGetToken();
    await app.inject({ method: 'PATCH', url: '/auth/me', headers: { authorization: `Bearer ${token}` }, payload: { avatarEmoji: '🐯' } });
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'Still Has Avatar' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.avatarEmoji).toBe('🐯');
    expect(res.json().user.displayName).toBe('Still Has Avatar');
  });
});

describe('password reset', () => {
  it('logs a reset link for a real email, and returns the same generic response for an unknown one (no account enumeration)', async () => {
    await signup();
    const known = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: CREDENTIALS.email } });
    const unknown = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'nobody@example.com' } });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());

    // Signup itself already issued a 'verify' link -- only one 'reset' link should
    // have been added on top of that.
    const resetLinks = testApp.actionLinks.filter((l) => l.kind === 'reset');
    expect(resetLinks).toHaveLength(1);
    expect(resetLinks[0]).toMatchObject({ kind: 'reset', email: 'teacher@example.com' });
  });

  it('resets the password end to end: old password stops working, new one works', async () => {
    await signup();
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: CREDENTIALS.email } });
    const link = testApp.actionLinks.find((l) => l.kind === 'reset')?.link;
    if (!link) throw new Error('expected a reset link to have been issued');
    const token = new URL(link).searchParams.get('resetToken');

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token, newPassword: 'a-brand-new-password' },
    });
    expect(reset.statusCode).toBe(200);

    const oldLogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: CREDENTIALS.email, password: CREDENTIALS.password } });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: CREDENTIALS.email, password: 'a-brand-new-password' },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it('rejects a garbage or already-used token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token: 'not-a-real-token', newPassword: 'whatever123' } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an expired token', async () => {
    await signup();
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: CREDENTIALS.email } });
    const link = testApp.actionLinks.find((l) => l.kind === 'reset')?.link;
    if (!link) throw new Error('expected a reset link to have been issued');
    const token = new URL(link).searchParams.get('resetToken');

    // Directly back-date the stored expiry -- the only way to exercise real expiry
    // without the test itself waiting an hour.
    const usersPath = path.join(testApp.dir, 'users.json');
    const users = JSON.parse(await readFile(usersPath, 'utf-8')) as { resetTokenExpiresAt: string | null }[];
    users[0]!.resetTokenExpiresAt = new Date(Date.now() - 1000).toISOString();
    await writeFile(usersPath, JSON.stringify(users, null, 2), 'utf-8');

    const reset = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token, newPassword: 'whatever123' } });
    expect(reset.statusCode).toBe(400);
  });
});

describe('email verification', () => {
  it('starts unverified and auto-sends a verify link at signup', async () => {
    const res = await signup();
    expect(res.json().user.emailVerified).toBe(false);
    expect(testApp.actionLinks).toHaveLength(1);
    expect(testApp.actionLinks[0]).toMatchObject({ kind: 'verify', email: 'teacher@example.com' });
  });

  it('verifies the account end to end', async () => {
    await signup();
    const link = testApp.actionLinks[0]?.link;
    if (!link) throw new Error('expected a verify link to have been issued at signup');
    const token = new URL(link).searchParams.get('verifyToken');

    const verify = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token } });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().user.emailVerified).toBe(true);
  });

  it('rejects a garbage token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: 'not-a-real-token' } });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication to request a new verification link', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/send-verification' });
    expect(res.statusCode).toBe(401);
  });

  it('reports alreadyVerified instead of re-sending once the account is verified', async () => {
    const signupRes = await signup();
    const { token: authToken } = signupRes.json() as { token: string };
    const link = testApp.actionLinks[0]?.link;
    if (!link) throw new Error('expected a verify link to have been issued at signup');
    const verifyToken = new URL(link).searchParams.get('verifyToken');
    await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: verifyToken } });

    const resend = await app.inject({ method: 'POST', url: '/auth/send-verification', headers: { authorization: `Bearer ${authToken}` } });
    expect(resend.statusCode).toBe(200);
    expect(resend.json()).toMatchObject({ alreadyVerified: true });
    // Only the original signup link, no second one sent for an already-verified account.
    expect(testApp.actionLinks).toHaveLength(1);
  });
});

describe('JWT expiration', () => {
  it('issues a token with an exp claim by default, bounding how long a leaked token stays useful', async () => {
    const res = await signup();
    const { token } = res.json() as { token: string };
    const payloadJson = Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as { exp?: number; iat?: number };
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBeGreaterThan(payload.iat ?? 0);
  });

  it('rejects a token once it actually expires, not just a token with no exp claim at all', async () => {
    const shortLived = makeTestApp({ jwtExpiresIn: '1s' });
    try {
      const signupRes = await shortLived.app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: CREDENTIALS,
      });
      const { token } = signupRes.json() as { token: string };

      const beforeExpiry = await shortLived.app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
      expect(beforeExpiry.statusCode).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const afterExpiry = await shortLived.app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
      expect(afterExpiry.statusCode).toBe(401);
    } finally {
      await shortLived.cleanup();
    }
  });
});

describe('rate limiting on /auth routes', () => {
  it('throttles repeated signup attempts from the same caller', async () => {
    // Sequential, not `Promise.all` — the point is simulating a caller hammering the
    // route, and the in-memory rate-limit store needs each request's count actually
    // committed before the next is checked (a burst of concurrent `.inject()` calls can
    // race the same counter and undercount).
    const statusCodes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await signup({ email: `rate-limit-${String(i)}@example.com` });
      statusCodes.push(res.statusCode);
    }
    expect(statusCodes.filter((code) => code === 429).length).toBeGreaterThan(0);
    expect(statusCodes.filter((code) => code === 201).length).toBeLessThanOrEqual(10);
  });
});
