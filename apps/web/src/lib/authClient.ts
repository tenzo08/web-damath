import { SERVER_HTTP_URL } from './serverConfig';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** Elo rating (apps/server/src/rating/elo.ts) — starts at 1200, moves after every online game (human or bot) that finishes with a winner or a draw. Local hot-seat play never touches it. */
  rating: number;
  /** One of lib/avatars.ts's AVATAR_OPTIONS, or null for the default initial-letter circle (ProfileButton.tsx). */
  avatarEmoji: string | null;
  /** A real uploaded photo (lib/avatars.ts's fileToAvatarDataUrl), or null — takes priority over avatarEmoji wherever both are set (components/Avatar.tsx). */
  avatarImage: string | null;
  /** Set once a verify-email link is redeemed. Not currently gating any feature -- just a real, checkable fact about the account. */
  emailVerified: boolean;
  /** How many placement games (apps/server/src/rating/elo.ts's PLACEMENT_GAMES_REQUIRED) this account has finished against the computer. Ranked online matchmaking routes straight to a bot game, no human wait, until this reaches placementGamesRequired. */
  placementGamesPlayed: number;
  placementGamesRequired: number;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

/** Returned by POST /auth/google when the Google identity doesn't match any existing account yet -- the client still needs to collect a nickname and password (completeGoogleSignup) before the account actually exists. */
export interface GooglePendingSignup {
  pending: true;
  pendingToken: string;
  email: string;
  suggestedName: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}. Is apps/server running?`);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${String(res.status)}).`);
  return data as T;
}

/** Returned by POST /auth/signup -- the account doesn't exist yet. The caller must collect the code sent to `email` and pass it to `verifySignupCode` before it does. */
export interface EmailPendingSignup {
  pending: true;
  pendingToken: string;
  email: string;
}

export function signup(email: string, password: string, displayName: string): Promise<EmailPendingSignup> {
  return post<EmailPendingSignup>('/auth/signup', { email, password, displayName });
}

/** Redeems the code sent to the pending signup's email -- this is the moment the account actually starts existing. */
export function verifySignupCode(pendingToken: string, code: string): Promise<AuthSession> {
  return post<AuthSession>('/auth/signup/verify', { pendingToken, code });
}

/** Issues a fresh code against the same pending signup, e.g. after the first one expired or never arrived. */
export function resendSignupCode(pendingToken: string): Promise<EmailPendingSignup> {
  return post<EmailPendingSignup>('/auth/signup/resend-code', { pendingToken });
}

export function login(email: string, password: string): Promise<AuthSession> {
  return post<AuthSession>('/auth/login', { email, password });
}

/** `idToken` is the credential Google Identity Services hands back client-side -- the server verifies it independently (auth/routes.ts), this call never trusts it on its own. Either logs straight in (an existing account, matched by Google id or by an already-verified email) or comes back `pending`, needing completeGoogleSignup next. */
export function googleAuth(idToken: string): Promise<AuthSession | GooglePendingSignup> {
  return post<AuthSession | GooglePendingSignup>('/auth/google', { idToken });
}

export function completeGoogleSignup(pendingToken: string, displayName: string, password: string): Promise<AuthSession> {
  return post<AuthSession>('/auth/google/complete', { pendingToken, displayName, password });
}

export async function me(token: string): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  if (!res.ok) throw new Error('Session expired — sign in again.');
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

export async function updateProfile(
  token: string,
  patch: { displayName?: string; avatarEmoji?: string | null; avatarImage?: string | null },
): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
  if (!res.ok || !data.user) throw new Error(data.error ?? `Request failed (${String(res.status)}).`);
  return data.user;
}

/** Always resolves — the server returns the same generic response whether or not the email is registered, so a caller can't enumerate accounts by watching for an error here. */
export async function forgotPassword(email: string): Promise<void> {
  await post<{ ok: true }>('/auth/forgot-password', { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await post<{ ok: true }>('/auth/reset-password', { token, newPassword });
}

export async function sendVerification(token: string): Promise<{ alreadyVerified?: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/auth/send-verification`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  const data = (await res.json().catch(() => ({}))) as { alreadyVerified?: boolean; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${String(res.status)}).`);
  return data;
}

export function verifyEmail(token: string): Promise<AuthUser> {
  return post<{ user: AuthUser }>('/auth/verify-email', { token }).then((r) => r.user);
}
