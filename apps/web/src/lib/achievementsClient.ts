import { SERVER_HTTP_URL } from './serverConfig';

/** Mirrors apps/server/src/achievements/compute.ts's Achievement exactly (hand-mirrored wire type, same convention as gameHistoryClient.ts/leaderboardClient.ts). */
export interface AchievementView {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export async function fetchAchievements(token: string): Promise<AchievementView[]> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/achievements`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  if (!res.ok) throw new Error('Could not load your achievements.');
  const data = (await res.json()) as { achievements: AchievementView[] };
  return data.achievements;
}
