import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { isValidAvatarEmoji, isValidAvatarImageDataUrl } from './avatars.js';
import type { User, UserStore } from './store.js';
import { PLACEMENT_GAMES_REQUIRED, STARTING_RATING } from '../rating/elo.js';

const googleAuthBodySchema = {
  type: 'object',
  required: ['idToken'],
  additionalProperties: false,
  properties: { idToken: { type: 'string', minLength: 1 } },
} as const;

const googleCompleteBodySchema = {
  type: 'object',
  required: ['pendingToken', 'displayName'],
  additionalProperties: false,
  properties: {
    pendingToken: { type: 'string', minLength: 1 },
    displayName: { type: 'string', minLength: 1, maxLength: 60 },
  },
} as const;

const devLoginBodySchema = {
  type: 'object',
  required: ['email', 'secret'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 254 },
    secret: { type: 'string', minLength: 1, maxLength: 200 },
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

/** Constant-time string comparison for `devLoginSecret` -- it's a real credential (whoever has it can log into any account by email), so it gets the same non-short-circuiting comparison a password would, not a plain `===`. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Google Sign-In is the only way into this app -- a self-serve email+password form
 * lets anyone claim to be any address, and even an emailed verification code only
 * proves control of an inbox, not a real identity. Google's own account (with its own
 * fraud detection, 2FA options, etc.) is the actual identity check. Every account here
 * either comes from `/auth/google`+`/auth/google/complete`, or (test/local use only)
 * `/auth/dev-login`.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  userStore: UserStore,
  /** Unset means Google sign-in is simply not offered on this deployment (a Client ID is a per-deployer setup step, not something this codebase can invent) -- `/auth/google` returns a clear 501 rather than crashing. */
  googleClientId?: string,
  /** Overrides how a Google ID token gets verified — defaults to a real call to Google's own servers (`defaultGoogleVerifier`). Tests inject a stub instead, so the suite never makes a real network call to a third party. */
  googleVerifier: GoogleIdTokenVerifier | null = googleClientId ? defaultGoogleVerifier(googleClientId) : null,
  /**
   * A shared secret that unlocks `POST /auth/dev-login`, which mints a real session
   * for any existing account by email -- entirely bypassing Google, for seeding and
   * testing accounts that can't reasonably go through a real Google sign-in (e.g. a
   * dummy tournament bracket). Unset (the default) means the route isn't even
   * registered, so there's zero surface for it in a deployment that never opts in.
   * Never called from the web client -- deliberately not wired into any UI.
   */
  devLoginSecret?: string,
): void {
  /**
   * Verifies a Google Identity Services ID token server-side (never trusts the client's
   * own claim of who it is) and either logs the matching account straight in, links an
   * existing account the first time it sees that email via Google (safe: Google's own
   * `email_verified` claim already proves ownership), or -- brand new email -- hands
   * back a short-lived pending token instead of creating an account outright, so the
   * account only actually exists once the person has chosen a nickname
   * (/auth/google/complete).
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

  /**
   * Finishes a brand-new Google signup: the pending token already proves the Google
   * identity and its verified email, so this only needs to collect (and validate the
   * uniqueness of) a nickname. `passwordHash` still gets a real random value -- the
   * `User` model's column is required -- but it's never checked against anything
   * (there's no password-login route), so it's never derived from anything a person
   * typed or could be asked to re-enter.
   */
  app.post<{ Body: { pendingToken: string; displayName: string } }>(
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
        passwordHash: randomBytes(32).toString('hex'),
        displayName,
        rating: STARTING_RATING,
        avatarEmoji: null,
        avatarImage: null,
        emailVerified: true, // Google already verified this email.
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

  if (devLoginSecret) {
    /** Test/local-only: mints a real session for an existing account by email, given the shared secret. Never wired into the web client. */
    app.post<{ Body: { email: string; secret: string } }>(
      '/auth/dev-login',
      { schema: { body: devLoginBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (request, reply) => {
        if (!safeEqual(request.body.secret, devLoginSecret)) {
          return reply.code(401).send({ error: 'unauthorized' });
        }
        const user = await userStore.findByEmail(request.body.email.trim().toLowerCase());
        if (!user) return reply.code(404).send({ error: 'no account with that email' });
        const token = await reply.jwtSign({ sub: user.id });
        return reply.send({ token, user: publicUser(user) });
      },
    );
  }
}
