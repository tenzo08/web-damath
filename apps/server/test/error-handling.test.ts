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
  it('POST /auth/signup returns a flat generic message, not the thrown error, when the store fails', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'damath-server-error-test-'));
    app = buildApp({
      jwtSecret: 'test-secret',
      userStore: new ThrowingUserStore(),
      gameStore: new FileGameStore(path.join(dir, 'games.json')),
      tournamentStore: new FileTournamentStore(path.join(dir, 'tournaments.json')),
      moderationStore: new FileModerationStore(path.join(dir, 'reports.json'), path.join(dir, 'blocks.json')),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'teacher@example.com', password: 'hunter22222', displayName: 'Ms. Cruz' },
    });

    expect(res.statusCode).toBe(500);
    const body = res.body;
    expect(body).not.toContain('neon.tech');
    expect(body).not.toContain('hunter2');
    expect(body).not.toContain('dbadmin');
    expect(res.json()).toEqual({ error: 'internal server error' });
  });
});
