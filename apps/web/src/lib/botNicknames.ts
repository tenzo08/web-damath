/**
 * Local practice mode (docs/AI_OPPONENT.md §3) never touches the server, so it needs
 * its own nickname pick -- hand-mirrored from apps/server/src/game/botNames.ts, same
 * convention lib/avatars.ts already uses for its own server-mirrored list. Picked
 * fresh per match (keyed on matchNonce in App.tsx), not fixed per tier.
 */
export const BOT_NICKNAMES: readonly string[] = [
  'Ella',
  'Miguel',
  'Sofia',
  'Diego',
  'Mika',
  'Kian',
  'Zoe',
  'Nico',
  'Iris',
  'Rey',
  'Gab',
  'Luna',
  'Basti',
  'Pia',
  'Tolits',
  'Cassy',
  'Enzo',
  'Yumi',
  'Marco',
  'Jules',
];

export function randomBotNickname(): string {
  const pick = BOT_NICKNAMES[Math.floor(Math.random() * BOT_NICKNAMES.length)];
  return pick ?? 'Alex';
}
