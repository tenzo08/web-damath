/**
 * Mirrors apps/server/src/auth/avatars.ts's AVATAR_OPTIONS exactly — the server is the
 * actual authority (PATCH /auth/me rejects anything not in its own copy of this list),
 * this is just what SettingsModal's picker renders. Hand-mirrored, same reasoning as
 * the client/server wire-type duplication elsewhere in this codebase: no shared
 * package between the two processes.
 */
export const AVATAR_OPTIONS = [
  '😀', '🦁', '🐯', '🐻', '🐼', '🦊', '🐸', '🐙', '🦉', '🐢', '🐲', '🦅', '⚡', '🌟', '🎯', '🏆',
] as const;
