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
