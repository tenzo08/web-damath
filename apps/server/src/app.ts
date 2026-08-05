import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { registerAuthRoutes } from './auth/routes.js';
import type { UserStore } from './auth/store.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export interface AppOptions {
  jwtSecret: string;
  userStore: UserStore;
  logger?: boolean;
}

/**
 * Builds a configured Fastify instance without calling `.listen()` — `index.ts` is the
 * only place that binds a port, so tests can exercise real routes via `.inject()`
 * without opening a socket.
 */
export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  app.register(fastifyJwt, { secret: options.jwtSecret });
  registerAuthRoutes(app, options.userStore);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
