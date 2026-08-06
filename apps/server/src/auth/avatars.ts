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
