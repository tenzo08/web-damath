import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DifficultyTier } from '@damath/ai';
import { buildApp } from './app.js';
import { FileUserStore, PrismaUserStore } from './auth/store.js';
import type { UserStore } from './auth/store.js';
import { FileGameStore, PrismaGameStore } from './game/store.js';
import type { GameStore } from './game/store.js';
import { FileTournamentStore, PrismaTournamentStore } from './tournament/store.js';
import type { TournamentStore } from './tournament/store.js';
import { FileModerationStore, PrismaModerationStore } from './moderation/store.js';
import type { ModerationStore } from './moderation/store.js';
import { createPrismaClient } from './db/prisma.js';

// Node's native env-file loader (available unconditionally on this project's minimum
// Node 22.13, `package.json`'s `engines`) — no `dotenv` dependency needed. Optional: a
// local `apps/server/.env` is a dev convenience (DEPLOYMENT.md); on Render, env vars are
// injected directly and no `.env` file exists at all, so a missing file is expected,
// not an error.
try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required — never falls back to a default secret.');
}

// Real persistence when DATABASE_URL is set (Postgres via Prisma — see
// prisma/schema.prisma), the JSON file stores otherwise. The file stores stay as the
// zero-setup local-dev path, not just a pre-migration relic — see KNOWLEDGE.md for why
// they're unsafe for anything beyond that.
let userStore: UserStore;
let gameStore: GameStore;
let tournamentStore: TournamentStore;
let moderationStore: ModerationStore;

if (process.env.DATABASE_URL) {
  const prisma = createPrismaClient(process.env.DATABASE_URL);
  userStore = new PrismaUserStore(prisma);
  gameStore = new PrismaGameStore(prisma);
  tournamentStore = new PrismaTournamentStore(prisma);
  moderationStore = new PrismaModerationStore(prisma);
} else {
  const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url));
  userStore = new FileUserStore(path.join(dataDir, 'users.json'));
  gameStore = new FileGameStore(path.join(dataDir, 'games'));
  tournamentStore = new FileTournamentStore(path.join(dataDir, 'tournaments.json'));
  moderationStore = new FileModerationStore(path.join(dataDir, 'reports.json'), path.join(dataDir, 'blocks.json'));
}

const TIERS: readonly DifficultyTier[] = ['learner', 'steady', 'sharp', 'tournament'];
function readTier(value: string | undefined, fallback: DifficultyTier): DifficultyTier {
  return TIERS.includes(value as DifficultyTier) ? (value as DifficultyTier) : fallback;
}

const app = buildApp({
  jwtSecret,
  userStore,
  gameStore,
  tournamentStore,
  moderationStore,
  logger: true,
  // docs/AI_OPPONENT.md §9 — environment variables, never hard-coded constants.
  queueBotTimeoutMs: process.env.QUEUE_BOT_TIMEOUT_MS ? Number(process.env.QUEUE_BOT_TIMEOUT_MS) : undefined,
  queueBotEnabled: process.env.QUEUE_BOT_ENABLED ? process.env.QUEUE_BOT_ENABLED !== 'false' : undefined,
  queueBotTier: readTier(process.env.QUEUE_BOT_TIER, 'steady'),
  disconnectForfeitMs: process.env.DISCONNECT_FORFEIT_MS ? Number(process.env.DISCONNECT_FORFEIT_MS) : undefined,
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : undefined,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  devLoginSecret: process.env.DEV_LOGIN_SECRET,
});
const port = Number(process.env.PORT ?? 3001);

// `corsOrigin` (app.ts) defaults to reflecting whatever origin sent the request --
// documented as fine for a demo/dev server behind auth on every meaningful route, not
// something a real public deployment should silently inherit. `CORS_ORIGIN` unset here
// means that default is in effect; only worth flagging once, at startup, and only in
// production, where a deployer who forgot to set it needs to actually notice.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  app.log.warn('CORS_ORIGIN is not set in production -- the API is reflecting any request origin. Set CORS_ORIGIN to your deployed web app\'s real origin.');
}

app
  .listen({ port, host: '0.0.0.0' })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
