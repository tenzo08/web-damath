import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { DifficultyTier } from '@damath/ai';
import { buildApp, type AppOptions } from '../src/app.js';
import { FileUserStore } from '../src/auth/store.js';
import { FileGameStore } from '../src/game/store.js';
import { FileTournamentStore } from '../src/tournament/store.js';
import { FileModerationStore } from '../src/moderation/store.js';

export interface TestApp {
  app: FastifyInstance;
  dir: string;
  cleanup: () => Promise<void>;
  /** Every password-reset/verify-email link "sent" so far — `notifyActionLink` (auth/routes.ts) pushes here instead of logging, since the token is one-way-hashed before storage and there's no other way for a test to observe it. */
  actionLinks: { kind: 'reset' | 'verify'; email: string; link: string }[];
}

export function makeTestApp(
  overrides: Partial<Omit<AppOptions, 'userStore' | 'gameStore' | 'tournamentStore' | 'moderationStore'>> = {},
): TestApp {
  const actionLinks: TestApp['actionLinks'] = [];
  const dir = mkdtempSync(path.join(tmpdir(), 'damath-server-test-'));
  const app = buildApp({
    jwtSecret: 'test-secret',
    userStore: new FileUserStore(path.join(dir, 'users.json')),
    gameStore: new FileGameStore(path.join(dir, 'games.json')),
    tournamentStore: new FileTournamentStore(path.join(dir, 'tournaments.json')),
    moderationStore: new FileModerationStore(path.join(dir, 'reports.json'), path.join(dir, 'blocks.json')),
    // Tests that don't care about matchmaking timing get an effectively-never-fires
    // default so they aren't flaky; tests that exercise bot fallback override this.
    queueBotTimeoutMs: 24 * 60 * 60 * 1000,
    notifyActionLink: (kind, email, link) => actionLinks.push({ kind, email, link }),
    ...overrides,
  });
  return {
    app,
    dir,
    actionLinks,
    cleanup: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const TIER: DifficultyTier = 'learner';
