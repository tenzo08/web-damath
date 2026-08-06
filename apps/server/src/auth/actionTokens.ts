import { randomBytes, createHash } from 'node:crypto';

/**
 * Shared by password reset and email verification (both "prove you control this
 * inbox" flows) — a random opaque token handed to the user, only its SHA-256 stored
 * server-side (same "never store the redeemable secret itself" reasoning as a
 * password hash: a leaked database still can't be used to redeem a pending token).
 * SHA-256 (not bcrypt) is deliberate here — this hash is looked up by exact match
 * (`findByResetTokenHash`/`findByVerifyTokenHash`), which needs a fast, deterministic
 * digest, not a slow, salted one; the token itself already carries 256 bits of
 * randomness, so no separate salt is needed the way a human-chosen password requires.
 */
export function generateActionToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashActionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const ONE_HOUR_MS = 60 * 60 * 1000;

export function actionTokenExpiry(fromNow = ONE_HOUR_MS): string {
  return new Date(Date.now() + fromNow).toISOString();
}

export function isActionTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}
