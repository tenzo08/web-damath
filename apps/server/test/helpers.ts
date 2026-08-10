import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { DifficultyTier } from '@damath/ai';
import { buildApp, type AppOptions } from '../src/app.js';
import { FileUserStore, type User, type UserStore } from '../src/auth/store.js';
import { FileGameStore } from '../src/game/store.js';
import { FileTournamentStore } from '../src/tournament/store.js';
import { FileModerationStore } from '../src/moderation/store.js';
import { STARTING_RATING } from '../src/rating/elo.js';

/** A fixed test-only secret for `/auth/dev-login` -- every test app is built with this by default, so any test can seed a real logged-in account without going through Google. Never used outside the test suite. */
export const TEST_DEV_LOGIN_SECRET = 'test-dev-login-secret';

export interface TestApp {
  app: FastifyInstance;
  dir: string;
  cleanup: () => Promise<void>;
  /** Direct store access for setup a plain HTTP call can't reach cleanly — e.g. fast-forwarding an account past its placement window (rating/elo.ts) for a test that isn't itself about placement. */
  userStore: UserStore;
}

export function makeTestApp(
  overrides: Partial<Omit<AppOptions, 'userStore' | 'gameStore' | 'tournamentStore' | 'moderationStore'>> = {},
): TestApp {
  const dir = mkdtempSync(path.join(tmpdir(), 'damath-server-test-'));
  const userStore = new FileUserStore(path.join(dir, 'users.json'));
  const app = buildApp({
    jwtSecret: 'test-secret',
    userStore,
    gameStore: new FileGameStore(path.join(dir, 'games')),
    tournamentStore: new FileTournamentStore(path.join(dir, 'tournaments.json')),
    moderationStore: new FileModerationStore(path.join(dir, 'reports.json'), path.join(dir, 'blocks.json')),
    // Tests that don't care about matchmaking timing get an effectively-never-fires
    // default so they aren't flaky; tests that exercise bot fallback override this.
    queueBotTimeoutMs: 24 * 60 * 60 * 1000,
    devLoginSecret: TEST_DEV_LOGIN_SECRET,
    ...overrides,
  });
  return {
    app,
    dir,
    userStore,
    cleanup: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const TIER: DifficultyTier = 'learner';

/**
 * Serializes `signupUser` calls per `TestApp` -- `FileUserStore.create` is a plain
 * read-modify-write over one JSON file (its own doc comment: "not safe for concurrent
 * writers"), and several tests seed two players via `Promise.all([signupToken(a),
 * signupToken(b)])`. Without this, two concurrent `create()` calls can both read the
 * file before either writes, and the second write silently clobbers the first user.
 */
const signupQueues = new WeakMap<TestApp, Promise<unknown>>();

/**
 * Seeds a real account directly in the store (bypassing Google entirely, the same way
 * `/auth/dev-login` exists to let a deployer do for real dummy accounts) and mints a
 * real session token for it via `/auth/dev-login` -- so tests exercise the actual
 * login-token issuance path, not a hand-rolled one. `passwordHash` is an opaque random
 * placeholder; nothing ever checks it, since there's no password-login route.
 */
export function signupUser(testApp: TestApp, payload: { email: string; displayName: string }): Promise<{ token: string; user: User }> {
  const prior = signupQueues.get(testApp) ?? Promise.resolve();
  const result = prior.then(() => doSignupUser(testApp, payload));
  signupQueues.set(
    testApp,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

async function doSignupUser(testApp: TestApp, payload: { email: string; displayName: string }): Promise<{ token: string; user: User }> {
  const email = payload.email.trim().toLowerCase();
  const user: User = {
    id: randomUUID(),
    email,
    passwordHash: randomBytes(32).toString('hex'),
    displayName: payload.displayName,
    rating: STARTING_RATING,
    avatarEmoji: null,
    avatarImage: null,
    emailVerified: true,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    verifyTokenHash: null,
    verifyTokenExpiresAt: null,
    googleId: null,
    placementGamesPlayed: 0,
    createdAt: new Date().toISOString(),
  };
  await testApp.userStore.create(user);

  const res = await testApp.app.inject({
    method: 'POST',
    url: '/auth/dev-login',
    payload: { email, secret: TEST_DEV_LOGIN_SECRET },
  });
  if (res.statusCode !== 200) {
    throw new Error(`dev-login failed (${String(res.statusCode)}): ${res.body}`);
  }
  return res.json() as { token: string; user: User };
}
