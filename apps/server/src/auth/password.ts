import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * scrypt via node:crypto, not bcrypt/argon2 — a well-established KDF with zero extra
 * runtime dependency and no native binary to build, which matters for a server package
 * that otherwise stays as dependency-light as the engine (KNOWLEDGE.md).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) {
    throw new Error('malformed stored password hash');
  }
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  // Length check first: timingSafeEqual throws on mismatched lengths rather than
  // returning false, and a malformed/tampered hash must never be able to crash the
  // login endpoint.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
