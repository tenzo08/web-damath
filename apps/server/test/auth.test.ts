import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { FileUserStore } from '../src/auth/store.js';

let dir: string;
let app: FastifyInstance;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'damath-server-auth-'));
  app = buildApp({ jwtSecret: 'test-secret', userStore: new FileUserStore(path.join(dir, 'users.json')) });
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

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
});
