import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import type { DifficultyTier } from '@damath/ai';
import { registerAuthRoutes, type ActionLinkNotifier, type GoogleIdTokenVerifier } from './auth/routes.js';
import type { UserStore } from './auth/store.js';
import { registerGameSocket } from './game/ws.js';
import { registerGameHistoryRoutes } from './game/history.js';
import { registerSpectateRoutes } from './game/spectate.js';
import { registerLeaderboardRoutes } from './rating/routes.js';
import { registerAchievementRoutes } from './achievements/routes.js';
import type { GameStore } from './game/store.js';
import { redactTokenFromUrl } from './log.js';
import type { RoomManager } from './game/rooms.js';
import { registerTournamentRoutes } from './tournament/routes.js';
import { TournamentManager } from './tournament/manager.js';
import type { TournamentStore } from './tournament/store.js';
import { registerModerationRoutes } from './moderation/routes.js';
import type { ModerationStore } from './moderation/store.js';

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
  moderationStore: ModerationStore;
  /** docs/AI_OPPONENT.md §9 — environment variables, never hard-coded constants. Defaults match the doc's table. */
  queueBotTimeoutMs?: number | undefined;
  queueBotEnabled?: boolean | undefined;
  queueBotTier?: DifficultyTier | undefined;
  /** How long a fully-disconnected player has to reconnect before forfeiting an active human-vs-human room — see game/ws.ts's `GameSocketOptions.disconnectForfeitMs`. */
  disconnectForfeitMs?: number | undefined;
  logger?: boolean | undefined;
  /** How long an issued login token stays valid, in `@fastify/jwt`'s `sign.expiresIn` format (e.g. `'30d'`). A token has no way to be individually revoked short of rotating `JWT_SECRET` (which logs out everyone at once) — an expiry bounds how long a leaked token stays useful without that. */
  jwtExpiresIn?: string | undefined;
  /**
   * Origins allowed to call the REST/WS API cross-origin — `true` (the default) reflects
   * whatever origin sent the request, fine for a demo/dev server behind auth on every
   * meaningful route. Pass an explicit allow-list in a real deployment.
   */
  corsOrigin?: boolean | string | string[] | undefined;
  /** Used only to build the human-facing link in the logged password-reset/verify-email message (auth/routes.ts) — no email provider is wired up. Defaults to the local web dev server's origin. */
  webOrigin?: string | undefined;
  /** Overrides how a password-reset/verify-email link is delivered — defaults to a log line (auth/routes.ts). Tests inject a capturing implementation instead, since the token is one-way-hashed before storage and can't be recovered any other way. */
  notifyActionLink?: ActionLinkNotifier | undefined;
  /** Google OAuth Client ID, used server-side to verify a Google ID token's `aud` claim (auth/routes.ts's /auth/google). Unset means Google sign-in isn't offered on this deployment — it's a per-deployer setup step (a real Google Cloud project), not something this codebase can supply a default for. */
  googleClientId?: string | undefined;
  /** Overrides how a Google ID token gets verified — defaults to a real call to Google's own servers when `googleClientId` is set (auth/routes.ts). Tests inject a stub instead, so the suite never makes a real network call to a third party. */
  googleVerifier?: GoogleIdTokenVerifier | undefined;
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
  // A route handler that throws (a DB connection failure, an unexpected bug) would
  // otherwise reach Fastify's own default error handler, which echoes the thrown
  // error's `.message` straight into the JSON response -- for something like a Prisma
  // connection error, that message routinely contains the database host and other
  // connection-string details, and for an arbitrary bug it can contain a stack trace.
  // Never acceptable to send to a client. Fastify's own errors (schema validation,
  // rate-limiting) already carry a safe, client-meaningful message and a real
  // `statusCode` below 500 -- those pass through unchanged; anything else is logged
  // in full server-side and replaced with a flat, generic message.
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) {
      return reply.code(statusCode).send({ error: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal server error' });
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
    registerAuthRoutes(
      app,
      options.userStore,
      options.webOrigin ?? 'http://localhost:5173',
      options.notifyActionLink,
      options.googleClientId,
      options.googleVerifier,
    );
    registerGameHistoryRoutes(app, options.gameStore, options.userStore);
    registerSpectateRoutes(app, options.gameStore, options.userStore);
    registerModerationRoutes(app, options.moderationStore, options.userStore);
    registerLeaderboardRoutes(app, options.userStore);
    registerAchievementRoutes(app, options.gameStore);

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
      moderationStore: options.moderationStore,
      queueBotTimeoutMs: options.queueBotTimeoutMs ?? 90000,
      queueBotEnabled: options.queueBotEnabled ?? true,
      queueBotTier: options.queueBotTier ?? 'steady',
      disconnectForfeitMs: options.disconnectForfeitMs ?? 30000,
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
