import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { actionTokenExpiry, generateActionToken, hashActionToken, isActionTokenExpired } from './actionTokens.js';
import { isValidAvatarEmoji, isValidAvatarImageDataUrl } from './avatars.js';
import { hashPassword, verifyPassword } from './password.js';
import type { User, UserStore } from './store.js';
import { PLACEMENT_GAMES_REQUIRED, STARTING_RATING } from '../rating/elo.js';

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

const googleAuthBodySchema = {
  type: 'object',
  required: ['idToken'],
  additionalProperties: false,
  properties: { idToken: { type: 'string', minLength: 1 } },
} as const;

const googleCompleteBodySchema = {
  type: 'object',
  required: ['pendingToken', 'displayName', 'password'],
  additionalProperties: false,
  properties: {
    pendingToken: { type: 'string', minLength: 1 },
    displayName: { type: 'string', minLength: 1, maxLength: 60 },
    password: { type: 'string', minLength: 8, maxLength: 200 },
  },
} as const;

/**
 * The short-lived token `/auth/google` hands back when no account exists yet for this
 * Google identity -- distinct `kind` so it can never be mistaken for (or misused as) a
 * real session token even though it's signed with the same JWT secret via the same
 * `app.jwt` instance. `sub` carries Google's own `sub` claim (not a real user id) --
 * reusing that key, rather than a separate `googleId` field, is what lets this satisfy
 * `@fastify/jwt`'s module-augmented `{ sub: string }` payload shape (app.ts) without a
 * type-widening cast at the call site. Verified with `app.jwt.verify` directly, not
 * `request.jwtVerify()`, since a decoded payload here is never a real session identity.
 */
interface GooglePendingClaims {
  sub: string;
  kind: 'google-pending';
  email: string;
}

export interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/** Verifies a Google ID token and returns its claims, or `null` for anything invalid (bad signature, wrong audience, expired) -- never throws. Injectable so tests can stub Google out entirely rather than needing a real network call to Google's own servers; production always uses `defaultGoogleVerifier`. */
export type GoogleIdTokenVerifier = (idToken: string) => Promise<GoogleIdTokenPayload | null>;

function defaultGoogleVerifier(clientId: string): GoogleIdTokenVerifier {
  const client = new OAuth2Client(clientId);
  return async (idToken) => {
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      return ticket.getPayload() ?? null;
    } catch {
      return null;
    }
  };
}

/** Never sends `passwordHash`/token hashes back over the wire. `placementGamesRequired` rides along (not just the raw count) so the client never hardcodes rating/elo.ts's own policy constant to compute "X of Y placement games" or a provisional badge. */
function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    rating: user.rating,
    avatarEmoji: user.avatarEmoji,
    avatarImage: user.avatarImage,
    emailVerified: user.emailVerified,
    placementGamesPlayed: user.placementGamesPlayed,
    placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
    createdAt: user.createdAt,
  };
}

const updateProfileBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    displayName: { type: 'string', minLength: 1, maxLength: 60 },
    avatarEmoji: { type: ['string', 'null'] },
    // A generous upper bound on the *encoded string*, not the real byte-cap check —
    // isValidAvatarImageDataUrl (auth/avatars.ts) does the actual decoded-size
    // validation below; this is just cheap enough to reject a wildly oversized body
    // before it's even parsed as a candidate data URL.
    avatarImage: { type: ['string', 'null'], maxLength: 500_000 },
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
  /** Unset means Google sign-in is simply not offered on this deployment (a Client ID is a per-deployer setup step, not something this codebase can invent) -- `/auth/google` returns a clear 501 rather than crashing. */
  googleClientId?: string,
  /** Overrides how a Google ID token gets verified — defaults to a real call to Google's own servers (`defaultGoogleVerifier`). Tests inject a stub instead, the same reasoning `notifyActionLink` above already has: no real network call to a third party from a test suite. */
  googleVerifier: GoogleIdTokenVerifier | null = googleClientId ? defaultGoogleVerifier(googleClientId) : null,
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
      if (await userStore.findByDisplayName(displayName)) {
        return reply.code(409).send({ error: 'this nickname is already taken' });
      }

      const verifyToken = generateActionToken();
      const user: User = {
        id: randomUUID(),
        email,
        passwordHash: await hashPassword(request.body.password),
        displayName,
        rating: STARTING_RATING,
        avatarEmoji: null,
        avatarImage: null,
        emailVerified: false,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        verifyTokenHash: hashActionToken(verifyToken),
        verifyTokenExpiresAt: actionTokenExpiry(),
        googleId: null,
        placementGamesPlayed: 0,
        createdAt: new Date().toISOString(),
      };
      await userStore.create(user);
      notifyActionLink('verify', user.email, `${webOrigin}/?verifyToken=${verifyToken}`);

      const token = await reply.jwtSign({ sub: user.id });
      return reply.code(201).send({ token, user: publicUser(user) });
    },
  );

  /**
   * Verifies a Google Identity Services ID token server-side (never trusts the client's
   * own claim of who it is) and either logs the matching account straight in, links an
   * existing email/password account the first time it sees that email via Google (safe:
   * Google's own `email_verified` claim already proves ownership), or -- brand new email
   * -- hands back a short-lived pending token instead of creating an account outright,
   * so the account only actually exists once the person has chosen a real nickname and
   * password (/auth/google/complete), same as ordinary signup always has.
   */
  app.post<{ Body: { idToken: string } }>(
    '/auth/google',
    { schema: { body: googleAuthBodySchema }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!googleVerifier) {
        return reply.code(501).send({ error: 'Google sign-in is not configured on this server' });
      }
      const payload = await googleVerifier(request.body.idToken);
      if (!payload) {
        return reply.code(401).send({ error: 'invalid Google credential' });
      }
      if (!payload.email || !payload.email_verified) {
        return reply.code(401).send({ error: "Google account's email is not verified" });
      }
      const email = payload.email.toLowerCase();

      const byGoogleId = await userStore.findByGoogleId(payload.sub);
      if (byGoogleId) {
        const token = await reply.jwtSign({ sub: byGoogleId.id });
        return reply.send({ token, user: publicUser(byGoogleId) });
      }

      const byEmail = await userStore.findByEmail(email);
      if (byEmail) {
        const linked: User = { ...byEmail, googleId: payload.sub, emailVerified: true };
        await userStore.update(linked);
        const token = await reply.jwtSign({ sub: linked.id });
        return reply.send({ token, user: publicUser(linked) });
      }

      const pendingClaims: GooglePendingClaims = { sub: payload.sub, kind: 'google-pending', email };
      const pendingToken = await app.jwt.sign(pendingClaims, { expiresIn: '10m' });
      return reply.send({ pending: true, pendingToken, email, suggestedName: payload.name ?? '' });
    },
  );

  /** Finishes a brand-new Google signup: the pending token already proves the Google identity and its verified email, so this only needs to collect (and validate the uniqueness of) a nickname, plus a real password -- Google is a second way to prove identity, not a replacement for having one, per the same reasoning `store.ts`'s `User.googleId` doc comment gives. */
  app.post<{ Body: { pendingToken: string; displayName: string; password: string } }>(
    '/auth/google/complete',
    { schema: { body: googleCompleteBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      let claims: GooglePendingClaims;
      try {
        const decoded = app.jwt.verify(request.body.pendingToken);
        if (typeof decoded !== 'object' || decoded === null || (decoded as { kind?: unknown }).kind !== 'google-pending') {
          throw new Error('not a pending-signup token');
        }
        claims = decoded as GooglePendingClaims;
      } catch {
        return reply.code(401).send({ error: 'this signup link has expired — sign in with Google again' });
      }

      const displayName = request.body.displayName.trim();
      if (displayName.length === 0) {
        return reply.code(400).send({ error: 'display name is required' });
      }
      // Re-checked here, not just trusted from /auth/google's own moment-in-time check —
      // someone else could have taken the email or the googleId (a duplicate tab, a
      // second completion attempt) in the time this pending token has been sitting
      // unused in the client.
      if (await userStore.findByEmail(claims.email)) {
        return reply.code(409).send({ error: 'an account with this email already exists' });
      }
      if (await userStore.findByGoogleId(claims.sub)) {
        return reply.code(409).send({ error: 'this Google account is already linked to another user' });
      }
      if (await userStore.findByDisplayName(displayName)) {
        return reply.code(409).send({ error: 'this nickname is already taken' });
      }

      const user: User = {
        id: randomUUID(),
        email: claims.email,
        passwordHash: await hashPassword(request.body.password),
        displayName,
        rating: STARTING_RATING,
        avatarEmoji: null,
        avatarImage: null,
        emailVerified: true, // Google already verified this email -- no separate verify-email step needed.
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        verifyTokenHash: null,
        verifyTokenExpiresAt: null,
        googleId: claims.sub,
        placementGamesPlayed: 0,
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

  app.patch<{ Body: { displayName?: string; avatarEmoji?: string | null; avatarImage?: string | null } }>(
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

      const { displayName, avatarEmoji, avatarImage } = request.body;
      if (avatarEmoji !== undefined && avatarEmoji !== null && !isValidAvatarEmoji(avatarEmoji)) {
        return reply.code(400).send({ error: 'not a recognised avatar option' });
      }
      if (avatarImage !== undefined && avatarImage !== null && !isValidAvatarImageDataUrl(avatarImage)) {
        return reply.code(400).send({ error: 'not a valid profile picture — must be a PNG, JPEG, or WebP image under 300KB' });
      }
      const trimmedName = displayName !== undefined ? displayName.trim() : undefined;
      if (trimmedName !== undefined && trimmedName.length === 0) {
        return reply.code(400).send({ error: 'display name is required' });
      }
      if (trimmedName !== undefined && trimmedName.toLowerCase() !== user.displayName.toLowerCase()) {
        const existing = await userStore.findByDisplayName(trimmedName);
        if (existing && existing.id !== user.id) {
          return reply.code(409).send({ error: 'this nickname is already taken' });
        }
      }

      const updated: User = {
        ...user,
        displayName: trimmedName ?? user.displayName,
        avatarEmoji: avatarEmoji !== undefined ? avatarEmoji : user.avatarEmoji,
        avatarImage: avatarImage !== undefined ? avatarImage : user.avatarImage,
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
