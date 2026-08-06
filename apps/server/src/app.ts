import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyWebsocket from '@fastify/websocket';
import type { DifficultyTier } from '@damath/ai';
import { registerAuthRoutes } from './auth/routes.js';
import type { UserStore } from './auth/store.js';
import { registerGameSocket } from './game/ws.js';
import type { GameStore } from './game/store.js';
import type { RoomManager } from './game/rooms.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export interface AppOptions {
  jwtSecret: string;
  userStore: UserStore;
  gameStore: GameStore;
  /** docs/AI_OPPONENT.md §9 — environment variables, never hard-coded constants. Defaults match the doc's table. */
  queueBotTimeoutMs?: number | undefined;
  queueBotEnabled?: boolean | undefined;
  queueBotTier?: DifficultyTier | undefined;
  logger?: boolean | undefined;
  /**
   * Origins allowed to call the REST/WS API cross-origin — `true` (the default) reflects
   * whatever origin sent the request, fine for a demo/dev server behind auth on every
   * meaningful route. Pass an explicit allow-list in a real deployment.
   */
  corsOrigin?: boolean | string | string[] | undefined;
}

declare module 'fastify' {
  interface FastifyInstance {
    roomManager: RoomManager;
  }
}

/**
 * Builds a configured Fastify instance without calling `.listen()` — `index.ts` is the
 * only place that binds a port, so tests can exercise real HTTP routes via `.inject()`
 * and real WebSocket connections against an ephemeral port without touching the CLI
 * entry. The `RoomManager` is reachable as `app.roomManager` for tests/routes that need
 * it directly, alongside the WS protocol most clients will actually use.
 */
export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  app.register(fastifyCors, { origin: options.corsOrigin ?? true });
  app.register(fastifyJwt, { secret: options.jwtSecret });
  app.register(fastifyWebsocket);
  registerAuthRoutes(app, options.userStore);

  app.get('/health', async () => ({ status: 'ok' }));

  const roomManager = registerGameSocket(app, {
    gameStore: options.gameStore,
    queueBotTimeoutMs: options.queueBotTimeoutMs ?? 45000,
    queueBotEnabled: options.queueBotEnabled ?? true,
    queueBotTier: options.queueBotTier ?? 'steady',
  });
  app.decorate('roomManager', roomManager);

  return app;
}
