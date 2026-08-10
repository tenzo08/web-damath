import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, signupUser, TEST_DEV_LOGIN_SECRET, type TestApp } from './helpers.js';

let testApp: TestApp;
let app: FastifyInstance;

beforeEach(() => {
  testApp = makeTestApp();
  app = testApp.app;
});

afterEach(() => testApp.cleanup());

const CREDENTIALS = { email: 'teacher@example.com', displayName: 'Ms. Cruz' };

async function signupAndGetToken(overrides: Partial<typeof CREDENTIALS> = {}): Promise<string> {
  const { token } = await signupUser(testApp, { ...CREDENTIALS, ...overrides });
  return token;
}

describe('POST /auth/dev-login', () => {
  it('mints a working session token for an existing account, given the right secret', async () => {
    await signupUser(testApp, CREDENTIALS);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: CREDENTIALS.email, secret: TEST_DEV_LOGIN_SECRET },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { token: string; user: { email: string; passwordHash?: string } };
    expect(body.token).toBeTypeOf('string');
    expect(body.user.email).toBe('teacher@example.com');
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('rejects the wrong secret', async () => {
    await signupUser(testApp, CREDENTIALS);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: CREDENTIALS.email, secret: 'wrong-secret' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('404s for an email with no account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'nobody@example.com', secret: TEST_DEV_LOGIN_SECRET },
    });
    expect(res.statusCode).toBe(404);
  });

  it("isn't registered at all when no devLoginSecret is configured", async () => {
    const noBypass = makeTestApp({ devLoginSecret: undefined });
    try {
      const res = await noBypass.app.inject({
        method: 'POST',
        url: '/auth/dev-login',
        payload: { email: 'anyone@example.com', secret: 'whatever' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await noBypass.cleanup();
    }
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

  it('returns the authenticated user for a token issued at signup', async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('teacher@example.com');
  });

  it('starts with no avatar — the default initial-letter circle, not a random pick', async () => {
    const token = await signupAndGetToken();
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.json().user.avatarEmoji).toBeNull();
  });
});

describe('PATCH /auth/me', () => {
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
    await signupUser(testApp, { email: 'other@example.com', displayName: 'Taken Name' });
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

describe('JWT expiration', () => {
  it('issues a token with an exp claim by default, bounding how long a leaked token stays useful', async () => {
    const token = await signupAndGetToken();
    const payloadJson = Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as { exp?: number; iat?: number };
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBeGreaterThan(payload.iat ?? 0);
  });

  it('rejects a token once it actually expires, not just a token with no exp claim at all', async () => {
    const shortLived = makeTestApp({ jwtExpiresIn: '1s' });
    try {
      const { token } = await signupUser(shortLived, CREDENTIALS);

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
  it('throttles repeated dev-login attempts from the same caller', async () => {
    // Sequential, not `Promise.all` — the point is simulating a caller hammering the
    // route, and the in-memory rate-limit store needs each request's count actually
    // committed before the next is checked (a burst of concurrent `.inject()` calls can
    // race the same counter and undercount).
    const statusCodes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/dev-login',
        payload: { email: `nobody-${String(i)}@example.com`, secret: TEST_DEV_LOGIN_SECRET },
      });
      statusCodes.push(res.statusCode);
    }
    expect(statusCodes.filter((code) => code === 429).length).toBeGreaterThan(0);
    expect(statusCodes.filter((code) => code === 404).length).toBeLessThanOrEqual(10);
  });
});
