import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { actionTokenExpiry, generateActionToken, hashActionToken, isActionTokenExpired } from './actionTokens.js';
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

const forgotPasswordBodySchema = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: { email: { type: 'string', minLength: 3, maxLength: 254 } },
} as const;

const resetPasswordBodySchema = {
  type: 'object',
  required: ['token', 'newPassword'],
  additionalProperties: false,
  properties: {
    token: { type: 'string', minLength: 1 },
    newPassword: { type: 'string', minLength: 8, maxLength: 200 },
  },
} as const;

const verifyEmailBodySchema = {
  type: 'object',
  required: ['token'],
  additionalProperties: false,
  properties: { token: { type: 'string', minLength: 1 } },
} as const;

/** Never sends `passwordHash`/token hashes back over the wire. */
function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    rating: user.rating,
    avatarEmoji: user.avatarEmoji,
    emailVerified: user.emailVerified,
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

/** Fires with the link a real email would have delivered — swapping in a real provider later is just replacing this one call site. Defaults to a structured log line (`app.log.info`); tests inject a capturing implementation instead, since there's no other way to observe a token that's deliberately one-way-hashed before storage. */
export type ActionLinkNotifier = (kind: 'reset' | 'verify', email: string, link: string) => void;

/**
 * `webOrigin` is only used to build the human-facing link handed to `notifyActionLink`
 * — there's no email provider wired up (a deliberate scope decision: this is a
 * classroom app with teacher-created accounts, and a real provider needs an
 * account/API key decision only the deployer can make). The token flow itself is
 * real: a genuine random token, hashed before storage, with a real expiry — only the
 * transport is a log line instead of an actual inbox.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  userStore: UserStore,
  webOrigin: string,
  notifyActionLink: ActionLinkNotifier = (kind, email, link) =>
    app.log.info({ email, link }, `${kind === 'reset' ? 'password reset' : 'verify-email'} link (no email provider configured — logged instead)`),
): void {
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

      const verifyToken = generateActionToken();
      const user: User = {
        id: randomUUID(),
        email,
        passwordHash: await hashPassword(request.body.password),
        displayName,
        rating: STARTING_RATING,
        avatarEmoji: null,
        emailVerified: false,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        verifyTokenHash: hashActionToken(verifyToken),
        verifyTokenExpiresAt: actionTokenExpiry(),
        createdAt: new Date().toISOString(),
      };
      await userStore.create(user);
      notifyActionLink('verify', user.email, `${webOrigin}/?verifyToken=${verifyToken}`);

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

  app.post<{ Body: { email: string } }>(
    '/auth/forgot-password',
    { schema: { body: forgotPasswordBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const user = await userStore.findByEmail(email);
      // Always 200 whether or not the account exists — a different response would let
      // a caller enumerate registered emails, same reasoning as /auth/login's message.
      if (user) {
        const resetToken = generateActionToken();
        await userStore.update({ ...user, resetTokenHash: hashActionToken(resetToken), resetTokenExpiresAt: actionTokenExpiry() });
        notifyActionLink('reset', user.email, `${webOrigin}/?resetToken=${resetToken}`);
      }
      return reply.send({ ok: true });
    },
  );

  app.post<{ Body: { token: string; newPassword: string } }>(
    '/auth/reset-password',
    { schema: { body: resetPasswordBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = await userStore.findByResetTokenHash(hashActionToken(request.body.token));
      if (!user || isActionTokenExpired(user.resetTokenExpiresAt)) {
        return reply.code(400).send({ error: 'this reset link is invalid or has expired' });
      }
      await userStore.update({
        ...user,
        passwordHash: await hashPassword(request.body.newPassword),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      });
      return reply.send({ ok: true });
    },
  );

  app.post(
    '/auth/send-verification',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      const user = await userStore.findById(request.user.sub);
      if (!user) return reply.code(401).send({ error: 'unauthorized' });
      if (user.emailVerified) return reply.send({ ok: true, alreadyVerified: true });

      const verifyToken = generateActionToken();
      await userStore.update({ ...user, verifyTokenHash: hashActionToken(verifyToken), verifyTokenExpiresAt: actionTokenExpiry() });
      notifyActionLink('verify', user.email, `${webOrigin}/?verifyToken=${verifyToken}`);
      return reply.send({ ok: true });
    },
  );

  app.post<{ Body: { token: string } }>('/auth/verify-email', { schema: { body: verifyEmailBodySchema } }, async (request, reply) => {
    const user = await userStore.findByVerifyTokenHash(hashActionToken(request.body.token));
    if (!user || isActionTokenExpired(user.verifyTokenExpiresAt)) {
      return reply.code(400).send({ error: 'this verification link is invalid or has expired' });
    }
    const updated: User = { ...user, emailVerified: true, verifyTokenHash: null, verifyTokenExpiresAt: null };
    await userStore.update(updated);
    return reply.send({ user: publicUser(updated) });
  });
}
