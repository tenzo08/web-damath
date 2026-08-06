import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DifficultyTier } from '@damath/ai';
import { buildApp } from './app.js';
import { FileUserStore } from './auth/store.js';
import { FileGameStore } from './game/store.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required — never falls back to a default secret.');
}

const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url));
const userStore = new FileUserStore(path.join(dataDir, 'users.json'));
const gameStore = new FileGameStore(path.join(dataDir, 'games.json'));

const TIERS: readonly DifficultyTier[] = ['learner', 'steady', 'sharp', 'tournament'];
function readTier(value: string | undefined, fallback: DifficultyTier): DifficultyTier {
  return TIERS.includes(value as DifficultyTier) ? (value as DifficultyTier) : fallback;
}

const app = buildApp({
  jwtSecret,
  userStore,
  gameStore,
  logger: true,
  // docs/AI_OPPONENT.md §9 — environment variables, never hard-coded constants.
  queueBotTimeoutMs: process.env.QUEUE_BOT_TIMEOUT_MS ? Number(process.env.QUEUE_BOT_TIMEOUT_MS) : undefined,
  queueBotEnabled: process.env.QUEUE_BOT_ENABLED ? process.env.QUEUE_BOT_ENABLED !== 'false' : undefined,
  queueBotTier: readTier(process.env.QUEUE_BOT_TIER, 'steady'),
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : undefined,
});
const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: '0.0.0.0' })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
