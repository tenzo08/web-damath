import { SERVER_HTTP_URL } from './serverConfig';

/** Mirrors apps/server/src/rating/routes.ts's PublicUserProfile exactly (hand-mirrored wire type, same convention as leaderboardClient.ts/spectateClient.ts). */
export interface PublicUserProfile {
  id: string;
  displayName: string;
  rating: number;
  avatarEmoji: string | null;
  avatarImage: string | null;
  provisional: boolean;
}

/** `null` for a 404 (e.g. the bot's own placeholder id, or an account that's since been deleted) — never thrown, since a missing opponent profile is expected and shouldn't break the game screen around it. */
export async function fetchUserProfile(token: string, userId: string): Promise<PublicUserProfile | null> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/users/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return (await res.json()) as PublicUserProfile;
}
