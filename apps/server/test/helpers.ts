import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { DifficultyTier } from '@damath/ai';
import { buildApp, type AppOptions } from '../src/app.js';
import { FileUserStore, type UserStore } from '../src/auth/store.js';
import { FileGameStore } from '../src/game/store.js';
import { FileTournamentStore } from '../src/tournament/store.js';
import { FileModerationStore } from '../src/moderation/store.js';

export interface TestApp {
  app: FastifyInstance;
  dir: string;
  cleanup: () => Promise<void>;
  /** Every password-reset/verify-email link "sent" so far — `notifyActionLink` (auth/routes.ts) pushes here instead of logging, since the token is one-way-hashed before storage and there's no other way for a test to observe it. */
  actionLinks: { kind: 'reset' | 'verify'; email: string; link: string }[];
  /** Every signup verification code "sent" so far — `notifySignupCode` (auth/routes.ts) pushes here instead of emailing, since the code is one-way-hashed before being embedded in the pending JWT. */
  signupCodes: { email: string; code: string }[];
  /** Direct store access for setup a plain HTTP call can't reach cleanly — e.g. fast-forwarding an account past its placement window (rating/elo.ts) for a test that isn't itself about placement. */
  userStore: UserStore;
}

export function makeTestApp(
  overrides: Partial<Omit<AppOptions, 'userStore' | 'gameStore' | 'tournamentStore' | 'moderationStore'>> = {},
): TestApp {
  const actionLinks: TestApp['actionLinks'] = [];
  const signupCodes: TestApp['signupCodes'] = [];
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
    notifyActionLink: (kind, email, link) => actionLinks.push({ kind, email, link }),
    notifySignupCode: (email, code) => signupCodes.push({ email, code }),
    ...overrides,
  });
  return {
    app,
    dir,
    actionLinks,
    signupCodes,
    userStore,
    cleanup: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const TIER: DifficultyTier = 'learner';

/**
 * Runs the full two-step signup flow (`/auth/signup` -> capture the emailed code from
 * `testApp.signupCodes` -> `/auth/signup/verify`) and returns the same `{ token, user }`
 * shape the old single-step `/auth/signup` used to hand back directly -- most tests
 * outside auth.test.ts just need a real logged-in account and don't care that account
 * creation is now gated behind a code, so this keeps their setup a one-liner.
 */
export async function signupUser(
  testApp: TestApp,
  payload: { email: string; password: string; displayName: string },
): Promise<{ token: string; user: { id: string; email: string; displayName: string } }> {
  const pending = await testApp.app.inject({ method: 'POST', url: '/auth/signup', payload });
  if (pending.statusCode !== 200) {
    throw new Error(`signup failed to start (${String(pending.statusCode)}): ${pending.body}`);
  }
  const { pendingToken, email } = pending.json() as { pendingToken: string; email: string };
  const codeEntry = testApp.signupCodes.filter((c) => c.email === email).at(-1);
  if (!codeEntry) throw new Error('expected a signup code to have been issued');
  const verify = await testApp.app.inject({
    method: 'POST',
    url: '/auth/signup/verify',
    payload: { pendingToken, code: codeEntry.code },
  });
  if (verify.statusCode !== 201) {
    throw new Error(`signup verify failed (${String(verify.statusCode)}): ${verify.body}`);
  }
  return verify.json() as { token: string; user: { id: string; email: string; displayName: string } };
}
