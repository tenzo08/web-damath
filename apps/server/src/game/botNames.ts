/**
 * A bot game still has `opponentType: 'bot'` internally (rooms.ts, store.ts) --
 * excluded from real leaderboards and tracked accurately everywhere it matters -- but
 * the *displayed* name is one of these instead of a "Computer (tier)" label, per
 * direct product decision. Picked fresh per bot game (persistAndInstantiateBot), not
 * fixed per tier, so it varies match to match.
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
  // BOT_NICKNAMES is a non-empty readonly literal -- this index is always in range.
  return pick ?? 'Alex';
}
