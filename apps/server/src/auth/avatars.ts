/**
 * The only values `PATCH /auth/me` will ever accept for `avatarEmoji` — a fixed set,
 * not arbitrary client text, matching apps/web/src/lib/avatars.ts (hand-mirrored, same
 * reasoning as the client/server wire-type duplication elsewhere in this codebase: no
 * shared package between the two processes).
 */
export const AVATAR_OPTIONS = [
  '😀', '🦁', '🐯', '🐻', '🐼', '🦊', '🐸', '🐙', '🦉', '🐢', '🐲', '🦅', '⚡', '🌟', '🎯', '🏆',
] as const;

export type AvatarEmoji = (typeof AVATAR_OPTIONS)[number];

export function isValidAvatarEmoji(value: unknown): value is AvatarEmoji {
  return typeof value === 'string' && (AVATAR_OPTIONS as readonly string[]).includes(value);
}

/**
 * A real uploaded profile picture, stored inline as a `data:` URL rather than on disk
 * or in a bucket — this app has no file-storage decision on record (KNOWLEDGE.md's
 * "Scoped-down persistence" reasoning for the DB itself applies just as much to file
 * storage: it's still a small classroom app, and standing up S3/Cloudinary is a bigger,
 * separate decision than "let a player pick their own photo"). The client
 * (`lib/avatars.ts`'s `fileToAvatarDataUrl`) downsizes to a small square before
 * upload, so the cap here is a hard backstop against a client that skips that step,
 * not the primary size control.
 */
export const MAX_AVATAR_IMAGE_BYTES = 300_000;

const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/;

export function isValidAvatarImageDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATA_URL_RE.exec(value);
  if (!match) return false;
  const base64 = match[2] ?? '';
  // Real decoded byte count, not the base64 string's own length (~33% larger) --
  // Buffer.byteLength on a base64 string over-counts padding-heavy input badly enough
  // that comparing against MAX_AVATAR_IMAGE_BYTES directly on `value.length` would let
  // through images meaningfully bigger than the stated cap.
  const byteLength = Buffer.from(base64, 'base64').length;
  return byteLength > 0 && byteLength <= MAX_AVATAR_IMAGE_BYTES;
}
