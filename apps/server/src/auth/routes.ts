import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { isValidAvatarEmoji } from './avatars.js';
import { hashPassword, verifyPassword } from './password.js';
import type { User, UserStore } from './store.js';
import { STARTING_RATING } from '../rating/elo.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signupBodySchema = {
  type: 'object',
  required: ['email', 'password', 'displayName'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 254 },
    password: { type: 'string', minLength: 8, maxLength: 200 },
    displayName: { type: 'string', minLength: 1, maxLength: 60 },
  },
} as const;

const loginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

/** Never sends `passwordHash` back over the wire. */
function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    rating: user.rating,
    avatarEmoji: user.avatarEmoji,
    createdAt: user.createdAt,
  };
}

const updateProfileBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    displayName: { type: 'string', minLength: 1, maxLength: 60 },
    avatarEmoji: { type: ['string', 'null'] },
  },
} as const;

export function registerAuthRoutes(app: FastifyInstance, userStore: UserStore): void {
  app.post<{ Body: { email: string; password: string; displayName: string } }>(
    '/auth/signup',
    { schema: { body: signupBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const displayName = request.body.displayName.trim();
      if (!EMAIL_RE.test(email)) {
        return reply.code(400).send({ error: 'invalid email address' });
      }
      if (displayName.length === 0) {
        return reply.code(400).send({ error: 'display name is required' });
      }
      if (await userStore.findByEmail(email)) {
        return reply.code(409).send({ error: 'an account with this email already exists' });
      }

      const user: User = {
        id: randomUUID(),
        email,
        passwordHash: await hashPassword(request.body.password),
        displayName,
        rating: STARTING_RATING,
        avatarEmoji: null,
        createdAt: new Date().toISOString(),
      };
      await userStore.create(user);

      const token = await reply.jwtSign({ sub: user.id });
      return reply.code(201).send({ token, user: publicUser(user) });
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    { schema: { body: loginBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const user = await userStore.findByEmail(email);
      // Same generic message whether the email is unknown or the password is wrong —
      // distinguishing the two would let a caller enumerate registered emails.
      const invalid = () => reply.code(401).send({ error: 'invalid email or password' });
      if (!user) return invalid();
      if (!(await verifyPassword(request.body.password, user.passwordHash))) return invalid();

      const token = await reply.jwtSign({ sub: user.id });
      return reply.send({ token, user: publicUser(user) });
    },
  );

  app.get('/auth/me', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const user = await userStore.findById(request.user.sub);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send({ user: publicUser(user) });
  });

  app.patch<{ Body: { displayName?: string; avatarEmoji?: string | null } }>(
    '/auth/me',
    { schema: { body: updateProfileBodySchema } },
    async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      const user = await userStore.findById(request.user.sub);
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const { displayName, avatarEmoji } = request.body;
      if (avatarEmoji !== undefined && avatarEmoji !== null && !isValidAvatarEmoji(avatarEmoji)) {
        return reply.code(400).send({ error: 'not a recognised avatar option' });
      }
      const trimmedName = displayName !== undefined ? displayName.trim() : undefined;
      if (trimmedName !== undefined && trimmedName.length === 0) {
        return reply.code(400).send({ error: 'display name is required' });
      }

      const updated: User = {
        ...user,
        displayName: trimmedName ?? user.displayName,
        avatarEmoji: avatarEmoji !== undefined ? avatarEmoji : user.avatarEmoji,
      };
      await userStore.update(updated);
      return reply.send({ user: publicUser(updated) });
    },
  );
}
