import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserStore } from '../auth/store.js';
import { PLACEMENT_GAMES_REQUIRED } from './elo.js';

export interface LeaderboardEntry {
  rank: number;
  id: string;
  displayName: string;
  rating: number;
  avatarEmoji: string | null;
  avatarImage: string | null;
  /** Still inside the placement window (elo.ts's PLACEMENT_GAMES_REQUIRED) — same "provisional rating" convention FIDE/USCF-style rating systems use, per elo.ts's own PLACEMENT_K_FACTOR comment. Shown, not filtered out: a small school leaderboard would otherwise be nearly empty. */
  provisional: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return request.user.sub;
}

/**
 * `GET /leaderboard` — top-N accounts by rating (rating/elo.ts), for the new leaderboard
 * page ("A real leaderboard... a top-N leaderboard is a cheap query against existing
 * data"). Requires sign-in, same convention `/games/live` and `/games/mine` already use
 * for the rest of this app's online-play surface — never gates on placement status
 * itself, since a placement-window account still has a real (just less certain) rating.
 */
export function registerLeaderboardRoutes(app: FastifyInstance, userStore: UserStore): void {
  app.get('/leaderboard', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const query = request.query as { limit?: string };
    const requested = query.limit ? Number(query.limit) : DEFAULT_LIMIT;
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;

    const users = await userStore.listTopByRating(limit);
    const entries: LeaderboardEntry[] = users.map((user, index) => ({
      rank: index + 1,
      id: user.id,
      displayName: user.displayName,
      rating: user.rating,
      avatarEmoji: user.avatarEmoji,
      avatarImage: user.avatarImage,
      provisional: user.placementGamesPlayed < PLACEMENT_GAMES_REQUIRED,
    }));
    return reply.send({ entries });
  });
}

/** Same public fields `LeaderboardEntry` already exposes for every *other* row on the leaderboard, minus `rank` — nothing here is more sensitive than what the leaderboard already shows a signed-in user about a stranger. */
export interface PublicUserProfile {
  id: string;
  displayName: string;
  rating: number;
  avatarEmoji: string | null;
  avatarImage: string | null;
  provisional: boolean;
}

/**
 * `GET /users/:id` — a human opponent's own name/rating for the online game screen
 * (`PublicGameView.players` only ever carries a user id — see room.ts's `getView()`
 * doc comment — so the client resolves the display fields itself, the same
 * "no userStore lookup inside the room's own synchronous getView()" boundary
 * `games/live`'s per-game `userStore.findById` calls already establish). Requires
 * sign-in like the rest of this app's online-play surface; a 404 for an unknown id is
 * expected and harmless (e.g. the special `BOT_PLAYER_ID` seat), never a hard failure.
 */
export function registerUserProfileRoutes(app: FastifyInstance, userStore: UserStore): void {
  app.get('/users/:id', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const { id } = request.params as { id: string };
    const user = await userStore.findById(id);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const profile: PublicUserProfile = {
      id: user.id,
      displayName: user.displayName,
      rating: user.rating,
      avatarEmoji: user.avatarEmoji,
      avatarImage: user.avatarImage,
      provisional: user.placementGamesPlayed < PLACEMENT_GAMES_REQUIRED,
    };
    return reply.send(profile);
  });
}
