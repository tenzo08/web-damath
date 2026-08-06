import { SERVER_HTTP_URL } from './serverConfig';
import type { VariantId } from '@damath/engine';

/** Mirrors apps/server/src/game/spectate.ts's LiveGameEntry exactly (hand-mirrored wire type, same convention as onlineProtocol.ts). */
export interface LiveGameEntry {
  id: string;
  variantId: VariantId;
  whiteName: string | null;
  blackName: string | null;
  moveCount: number;
  updatedAt: string;
}

export async function liveGames(token: string): Promise<LiveGameEntry[]> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/games/live`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  if (!res.ok) throw new Error('Could not load live games.');
  const data = (await res.json()) as { games: LiveGameEntry[] };
  return data.games;
}
