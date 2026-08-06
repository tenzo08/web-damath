import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import type { DifficultyTier } from '@damath/ai';
import { registerAuthRoutes } from './auth/routes.js';
import type { UserStore } from './auth/store.js';
import { registerGameSocket } from './game/ws.js';
import { registerGameHistoryRoutes } from './game/history.js';
import { registerSpectateRoutes } from './game/spectate.js';
import type { GameStore } from './game/store.js';
import { redactTokenFromUrl } from './log.js';
import type { RoomManager } from './game/rooms.js';
import { registerTournamentRoutes } from './tournament/routes.js';
import { TournamentManager } from './tournament/manager.js';
import type { TournamentStore } from './tournament/store.js';

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
  tournamentStore: TournamentStore;
  /** docs/AI_OPPONENT.md §9 — environment variables, never hard-coded constants. Defaults match the doc's table. */
  queueBotTimeoutMs?: number | undefined;
  queueBotEnabled?: boolean | undefined;
  queueBotTier?: DifficultyTier | undefined;
  logger?: boolean | undefined;
  /** How long an issued login token stays valid, in `@fastify/jwt`'s `sign.expiresIn` format (e.g. `'30d'`). A token has no way to be individually revoked short of rotating `JWT_SECRET` (which logs out everyone at once) — an expiry bounds how long a leaked token stays useful without that. */
  jwtExpiresIn?: string | undefined;
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
  const app = Fastify({
    // A custom `req` serializer, not the bare `logger: true` this used to be — the
    // default one logs the full request URL including its query string, and `/ws`'s
    // handshake carries a live JWT there (`game/ws.ts`, `?token=...`). See log.ts.
    logger: options.logger
      ? {
          serializers: {
            req(request: { method: string; url: string; hostname: string; ip: string }) {
              return { method: request.method, url: redactTokenFromUrl(request.url), hostname: request.hostname, remoteAddress: request.ip };
            },
          },
        }
      : false,
  });
  app.register(fastifyCors, { origin: options.corsOrigin ?? true });
  app.register(fastifyJwt, { secret: options.jwtSecret, sign: { expiresIn: options.jwtExpiresIn ?? '30d' } });
  // A generous global default (gameplay/tournament routes shouldn't ever feel it) plus a
  // tight per-route override on signup/login below, where it actually matters — open
  // endpoints with no auth in front of them, the natural target for credential stuffing
  // or signup spam.
  app.register(fastifyRateLimit, { max: 300, timeWindow: '1 minute' });
  app.register(fastifyWebsocket);

  // `app.after`, not a bare synchronous call: `@fastify/rate-limit`'s per-route
  // `config.rateLimit` override (and even its own global default) only actually takes
  // effect for routes declared once the plugin's own registration has resolved.
  // Registering routes synchronously in the same tick as `app.register(fastifyRateLimit,
  // ...)` above silently attaches no rate limiting at all — caught by a real request
  // test asserting a 429 actually shows up, not just that the config object looks right.
  app.after(() => {
    registerAuthRoutes(app, options.userStore);
    registerGameHistoryRoutes(app, options.gameStore, options.userStore);
    registerSpectateRoutes(app, options.gameStore, options.userStore);

    app.get('/health', async () => ({ status: 'ok' }));

    // `TournamentManager` needs `broadcastToAll` (from `registerGameSocket`, below) to
    // push live updates; `registerGameSocket` needs `tournamentManager.reportResult`
    // (via `onTournamentMatchFinished`) to auto-report a finished match — a genuine
    // circular dependency between the two, broken with a ref box (`.current` mutated
    // once, right after `registerGameSocket` returns; `broadcastRef` itself never
    // reassigned). `onChange` is never actually *called* until some later tournament
    // mutation happens, by which point `.current` is always set.
    const broadcastRef: { current: ((message: unknown) => void) | undefined } = { current: undefined };

    const tournamentManager = new TournamentManager(options.tournamentStore, {
      onChange: (tournament) => broadcastRef.current?.({ type: 'tournament_updated', tournament }),
    });

    const gameSocket = registerGameSocket(app, {
      gameStore: options.gameStore,
      userStore: options.userStore,
      queueBotTimeoutMs: options.queueBotTimeoutMs ?? 45000,
      queueBotEnabled: options.queueBotEnabled ?? true,
      queueBotTier: options.queueBotTier ?? 'steady',
      // A drawn match (no clear winner) is left for the manual report route — Damath has
      // no automatic tiebreak (docs/DAMATH_RULES.md). Awaited by `RoomManager` before its
      // own move/resign response resolves, so the tournament store is durably updated
      // before the room's "finished" state ever reaches a client (rooms.ts). A
      // late/duplicate report (e.g. a rare double-fire) is rejected by `reportResult`
      // itself and swallowed here rather than crashing the room's move-handling path.
      onTournamentMatchFinished: async (ref, winnerUserId) => {
        await tournamentManager.reportResult(ref.tournamentId, ref.round, ref.index, winnerUserId, winnerUserId).catch(() => {});
      },
    });
    broadcastRef.current = gameSocket.broadcastToAll;
    app.decorate('roomManager', gameSocket.roomManager);

    registerTournamentRoutes(app, tournamentManager, gameSocket.roomManager);
  });

  return app;
}
