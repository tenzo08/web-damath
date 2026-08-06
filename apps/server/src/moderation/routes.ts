import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ModerationStore } from './store.js';
import type { UserStore } from '../auth/store.js';

async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return request.user.sub;
}

const reportBodySchema = {
  type: 'object',
  required: ['reportedUserId', 'reason'],
  additionalProperties: false,
  properties: {
    reportedUserId: { type: 'string', minLength: 1 },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
    roomId: { type: 'string', nullable: true },
  },
} as const;

const blockBodySchema = {
  type: 'object',
  required: ['blockedUserId'],
  additionalProperties: false,
  properties: {
    blockedUserId: { type: 'string', minLength: 1 },
  },
} as const;

export interface BlockedEntry {
  userId: string;
  displayName: string | null;
  createdAt: string;
}

/**
 * Reports and blocks — the moderation floor for a tool with real accounts (chess.com-
 * inspired suggestion #7, TASK.md). Reports have no review UI yet: this app has no
 * admin/role concept to gate one behind, that's a bigger separate decision. They're
 * stored durably (`ModerationStore`) so a real admin can query them directly in the
 * meantime — silently discarding them would be worse than an incomplete UI.
 */
export function registerModerationRoutes(app: FastifyInstance, moderationStore: ModerationStore, userStore: UserStore): void {
  app.post<{ Body: { reportedUserId: string; reason: string; roomId?: string | null } }>(
    '/reports',
    { schema: { body: reportBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await requireUserId(request, reply);
      if (!userId) return;
      if (request.body.reportedUserId === userId) {
        return reply.code(400).send({ error: 'cannot report yourself' });
      }
      await moderationStore.createReport({
        id: randomUUID(),
        reporterUserId: userId,
        reportedUserId: request.body.reportedUserId,
        reason: request.body.reason.trim(),
        roomId: request.body.roomId ?? null,
        createdAt: new Date().toISOString(),
      });
      return reply.code(201).send({ ok: true });
    },
  );

  app.post<{ Body: { blockedUserId: string } }>('/blocks', { schema: { body: blockBodySchema } }, async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    if (request.body.blockedUserId === userId) {
      return reply.code(400).send({ error: 'cannot block yourself' });
    }
    await moderationStore.createBlock({
      id: randomUUID(),
      blockerUserId: userId,
      blockedUserId: request.body.blockedUserId,
      createdAt: new Date().toISOString(),
    });
    return reply.code(201).send({ ok: true });
  });

  app.delete<{ Params: { userId: string } }>('/blocks/:userId', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    await moderationStore.removeBlock(userId, request.params.userId);
    return reply.send({ ok: true });
  });

  app.get('/blocks/mine', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;
    const blocks = await moderationStore.listBlocksByUser(userId);
    const entries: BlockedEntry[] = [];
    for (const block of blocks) {
      const blocked = await userStore.findById(block.blockedUserId);
      entries.push({ userId: block.blockedUserId, displayName: blocked?.displayName ?? null, createdAt: block.createdAt });
    }
    return reply.send({ blocked: entries });
  });
}
