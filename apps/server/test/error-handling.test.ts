import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { User, UserStore } from '../src/auth/store.js';
import { FileGameStore } from '../src/game/store.js';
import { FileTournamentStore } from '../src/tournament/store.js';
import { FileModerationStore } from '../src/moderation/store.js';

/**
 * A store whose `create` fails the way a real Prisma connection failure does: the
 * thrown error's own `.message` names the database host and would-be credentials —
 * exactly the shape of a real `PrismaClientInitializationError`. Never a made-up
 * shape, so this test fails honestly if the handler ever stops matching how Prisma
 * errors actually look.
 */
const SENSITIVE_MESSAGE = "Can't reach database server at `ep-fake-project-12345.us-east-2.aws.neon.tech:5432` (user=dbadmin, password=hunter2)";

class ThrowingUserStore implements UserStore {
  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }
  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }
  findByDisplayName(): Promise<User | null> {
    return Promise.resolve(null);
  }
  findByGoogleId(): Promise<User | null> {
    return Promise.resolve(null);
  }
  create(): Promise<void> {
    return Promise.reject(new Error(SENSITIVE_MESSAGE));
  }
  update(): Promise<void> {
    return Promise.reject(new Error(SENSITIVE_MESSAGE));
  }
  findByResetTokenHash(): Promise<User | null> {
    return Promise.resolve(null);
  }
  findByVerifyTokenHash(): Promise<User | null> {
    return Promise.resolve(null);
  }
  listTopByRating(): Promise<User[]> {
    return Promise.resolve([]);
  }
}

let app: FastifyInstance | undefined;
let dir: string | undefined;

afterEach(async () => {
  await app?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  app = undefined;
  dir = undefined;
});

describe('unhandled errors never reach the client (security -- never leak DB/infra details)', () => {
  it('POST /auth/google/complete returns a flat generic message, not the thrown error, when the store fails', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'damath-server-error-test-'));
    app = buildApp({
      jwtSecret: 'test-secret',
      userStore: new ThrowingUserStore(),
      gameStore: new FileGameStore(path.join(dir, 'games')),
      tournamentStore: new FileTournamentStore(path.join(dir, 'tournaments.json')),
      moderationStore: new FileModerationStore(path.join(dir, 'reports.json'), path.join(dir, 'blocks.json')),
    });

    // `@fastify/jwt` only decorates `app.jwt` once plugin registration resolves --
    // `.inject()` awaits that internally before dispatching a request, but calling
    // `app.jwt.sign` directly here needs the same wait made explicit.
    await app.ready();

    // A hand-signed pending token, standing in for the real one /auth/google would
    // have handed back -- no real network call to Google needed for this test to
    // reach the /auth/google/complete handler's own userStore.create() call.
    const pendingToken = await app.jwt.sign({ sub: 'google-sub-1', kind: 'google-pending', email: 'teacher@example.com' }, { expiresIn: '10m' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/google/complete',
      payload: { pendingToken, displayName: 'Ms. Cruz' },
    });

    expect(res.statusCode).toBe(500);
    const body = res.body;
    expect(body).not.toContain('neon.tech');
    expect(body).not.toContain('hunter2');
    expect(body).not.toContain('dbadmin');
    expect(res.json()).toEqual({ error: 'internal server error' });
  });
});
