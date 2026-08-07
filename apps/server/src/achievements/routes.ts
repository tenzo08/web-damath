import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GameStore } from '../game/store.js';
import { computeAchievements } from './compute.js';

async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return request.user.sub;
}

/** `GET /achievements` — this signed-in user's badge unlock states, same auth convention as `/games/mine`/`/games/live`/`/leaderboard`. */
export function registerAchievementRoutes(app: FastifyInstance, gameStore: GameStore): void {
  app.get('/achievements', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    const achievements = await computeAchievements(userId, gameStore);
    return reply.send({ achievements });
  });
}
