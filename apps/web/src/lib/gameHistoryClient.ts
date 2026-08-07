import { SERVER_HTTP_URL } from './serverConfig';
import type { VariantId, Player } from '@damath/engine';

/** Mirrors apps/server/src/game/history.ts's GameHistoryEntry exactly (hand-mirrored wire type, same convention as onlineProtocol.ts). */
export interface GameHistoryEntry {
  id: string;
  variantId: VariantId;
  opponentType: 'human' | 'bot';
  botTier: string | null;
  /** A friendly display name, never "Computer" -- null for a human game. */
  botNickname: string | null;
  opponentName: string | null;
  opponentUserId: string | null;
  myColor: Player | null;
  status: 'active' | 'finished';
  result: 'win' | 'loss' | 'draw' | null;
  moveCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function myGameHistory(token: string): Promise<GameHistoryEntry[]> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/games/mine`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  if (!res.ok) throw new Error('Could not load your match history.');
  const data = (await res.json()) as { games: GameHistoryEntry[] };
  return data.games;
}
