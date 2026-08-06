import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { finalScores, replayMoves } from '@damath/engine';
import type { AnyVariant, Move, Player, Variant, VariantId } from '@damath/engine';
import type { GameStore, PersistedGame } from './store.js';
import { findVariant } from './variants.js';
import type { UserStore } from '../auth/store.js';

type ValueOf<T> = T extends Variant<infer V> ? V : never;

export interface GameHistoryEntry {
  id: string;
  variantId: VariantId;
  opponentType: 'human' | 'bot';
  botTier: string | null;
  /** The human opponent's current display name, or `null` for a bot game or if that account no longer exists. */
  opponentName: string | null;
  myColor: Player | null;
  status: 'active' | 'finished';
  /** `null` while the game is still active — otherwise relative to the requesting user, not to `white`/`black`. */
  result: 'win' | 'loss' | 'draw' | null;
  moveCount: number;
  createdAt: string;
  updatedAt: string;
}

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
 * Replays the move history to determine the winner — the same computation `room.ts`'s
 * `computeWinner`/`finalScores` do for a live room's `PublicGameView`, done here for a
 * batch of historical, possibly-inactive games instead of one live one. `V` is
 * re-attached to the stored `unknown[]` moveHistory via the same JSON-boundary trust
 * point every other persistence-crossing call site in this codebase uses.
 */
async function summarize(game: PersistedGame, userId: string, variant: AnyVariant, userStore: UserStore): Promise<GameHistoryEntry> {
  type V = ValueOf<AnyVariant>;
  const v = variant as Variant<V>;
  const state = replayMoves(v, game.moveHistory as Move<V>[]);
  const isOver = game.status === 'finished' || game.resignedBy !== null || game.drawnByAgreement;

  let winner: Player | null = null;
  if (isOver) {
    if (game.resignedBy) {
      winner = game.resignedBy === 'white' ? 'black' : 'white';
    } else if (game.drawnByAgreement) {
      winner = null;
    } else {
      const finals = finalScores(state, v.arithmetic);
      const order = v.arithmetic.compare(finals.white, finals.black);
      winner = order > 0 ? 'white' : order < 0 ? 'black' : null;
    }
  }

  const myColor: Player | null = game.players.white === userId ? 'white' : game.players.black === userId ? 'black' : null;
  const result: GameHistoryEntry['result'] = !isOver ? null : winner === null ? 'draw' : winner === myColor ? 'win' : 'loss';

  const opponentId = myColor === 'white' ? game.players.black : myColor === 'black' ? game.players.white : null;
  const opponent = game.opponentType === 'human' && opponentId ? await userStore.findById(opponentId) : null;

  return {
    id: game.id,
    variantId: game.variantId,
    opponentType: game.opponentType,
    botTier: game.botTier,
    opponentName: opponent?.displayName ?? null,
    myColor,
    // `game.status` alone only reflects the engine's own game-over check — a
    // resignation never flips it (KNOWLEDGE.md, "Resignation is UI state, not an
    // engine concept"; `room.ts`'s `onPersist` calls always pass `game.status`
    // verbatim). Combine it with `resignedBy` the same way `room.ts`'s `getView()`
    // does for a live room, or a resigned game would show as still "active" here.
    status: isOver ? 'finished' : 'active',
    result,
    moveCount: state.moveHistory.length,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

export function registerGameHistoryRoutes(app: FastifyInstance, gameStore: GameStore, userStore: UserStore): void {
  app.get('/games/mine', async (request, reply) => {
    const userId = await requireUserId(request, reply);
    if (!userId) return;

    const games = await gameStore.listForUser(userId, 50);
    const entries: GameHistoryEntry[] = [];
    for (const game of games) {
      const variant = findVariant(game.variantId);
      // Defensive only — every persisted game was created with a real variant id; skip
      // rather than 500 if data from an older/different build ever violates that.
      if (!variant) continue;
      entries.push(await summarize(game, userId, variant, userStore));
    }
    return reply.send({ games: entries });
  });
}
