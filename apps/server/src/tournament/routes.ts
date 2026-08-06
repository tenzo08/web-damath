import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { VariantId } from '@damath/engine';
import type { TournamentManager } from './manager.js';

async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return request.user.sub;
}

const createBodySchema = {
  type: 'object',
  required: ['name', 'variantId'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    variantId: { type: 'string' },
  },
} as const;

export function registerTournamentRoutes(app: FastifyInstance, manager: TournamentManager): void {
  app.post<{ Body: { name: string; variantId: VariantId } }>(
    '/tournaments',
    { schema: { body: createBodySchema } },
    async (request, reply) => {
      const userId = await requireUserId(request, reply);
      if (!userId) return;
      const tournament = await manager.create(request.body.name.trim(), request.body.variantId, userId);
      return reply.code(201).send({ tournament });
    },
  );

  app.get('/tournaments', async () => ({ tournaments: await manager.list() }));

  app.get<{ Params: { id: string } }>('/tournaments/:id', async (request, reply) => {
    const tournament = await manager.get(request.params.id);
    if (!tournament) return reply.code(404).send({ error: 'tournament not found' });
    return reply.send({ tournament, standings: manager.standingsFor(tournament) });
  });

  app.post<{ Params: { code: string } }>('/tournaments/join/:code', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    const result = await manager.join(request.params.code, userId);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return reply.send({ tournament: result.tournament });
  });

  app.post<{ Params: { id: string } }>('/tournaments/:id/start', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    const result = await manager.start(request.params.id, userId);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return reply.send({ tournament: result.tournament });
  });

  app.post<{ Params: { id: string; round: string; index: string }; Body: { winnerId: string } }>(
    '/tournaments/:id/matches/:round/:index/result',
    async (request, reply) => {
      const userId = await requireUserId(request, reply);
      if (!userId) return;
      const round = Number(request.params.round);
      const index = Number(request.params.index);
      if (!Number.isInteger(round) || !Number.isInteger(index)) {
        return reply.code(400).send({ error: 'round and index must be integers' });
      }
      const result = await manager.reportResult(request.params.id, round, index, request.body.winnerId, userId);
      if (!result.ok) return reply.code(400).send({ error: result.error });
      return reply.send({ tournament: result.tournament });
    },
  );
}
