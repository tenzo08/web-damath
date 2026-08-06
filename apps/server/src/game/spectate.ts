import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { VariantId } from '@damath/engine';
import type { GameStore } from './store.js';
import type { UserStore } from '../auth/store.js';

export interface LiveGameEntry {
  id: string;
  variantId: VariantId;
  whiteName: string | null;
  blackName: string | null;
  moveCount: number;
  updatedAt: string;
}

async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return request.user.sub;
}

/**
 * `GET /games/live` — every currently-in-progress human-vs-human game, for the
 * spectator list (chess.com-inspired suggestion #? — "spectating a live game",
 * TASK.md). Deliberately doesn't touch the engine at all: a summary listing only needs
 * player names and a move count, both already sitting on `PersistedGame` directly —
 * no need to replay `moveHistory` the way `history.ts`'s per-game result computation
 * does. Requires sign-in, same as the rest of this app's online-play surface.
 */
export function registerSpectateRoutes(app: FastifyInstance, gameStore: GameStore, userStore: UserStore): void {
  app.get('/games/live', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const games = await gameStore.listActive(50);
    const entries: LiveGameEntry[] = [];
    for (const game of games) {
      const [white, black] = await Promise.all([
        game.players.white ? userStore.findById(game.players.white) : null,
        game.players.black ? userStore.findById(game.players.black) : null,
      ]);
      entries.push({
        id: game.id,
        variantId: game.variantId,
        whiteName: white?.displayName ?? null,
        blackName: black?.displayName ?? null,
        moveCount: game.moveHistory.length,
        updatedAt: game.updatedAt,
      });
    }
    return reply.send({ games: entries });
  });
}
