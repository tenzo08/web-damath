import { SERVER_HTTP_URL } from './serverConfig';

/** Mirrors apps/server/src/rating/routes.ts's LeaderboardEntry exactly (hand-mirrored wire type, same convention as onlineProtocol.ts/gameHistoryClient.ts). */
export interface LeaderboardEntry {
  rank: number;
  id: string;
  displayName: string;
  rating: number;
  avatarEmoji: string | null;
  avatarImage: string | null;
  provisional: boolean;
}

export async function fetchLeaderboard(token: string, limit = 50): Promise<LeaderboardEntry[]> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/leaderboard?limit=${String(limit)}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  if (!res.ok) throw new Error('Could not load the leaderboard.');
  const data = (await res.json()) as { entries: LeaderboardEntry[] };
  return data.entries;
}
