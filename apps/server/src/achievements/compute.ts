import { applyMove, createGame, pieceAt } from '@damath/engine';
import type { AnyVariant, Move, Player, Variant } from '@damath/engine';
import { finalScores } from '@damath/engine';
import type { GameStore, PersistedGame } from '../game/store.js';
import { findVariant } from '../game/variants.js';

type ValueOf<T> = T extends Variant<infer V> ? V : never;

export interface AchievementDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
}

export interface Achievement extends AchievementDefinition {
  readonly unlocked: boolean;
}

/**
 * Every game-derived badge, in display order. "Cheap to compute from existing game
 * events" (TASK.md-shaped feature request) — deliberately not a new persisted table:
 * every one of these is derived on request from `GameStore.listForUser`, the same data
 * `/games/mine` already serves, so there's nothing to keep in sync or migrate. The
 * tradeoff is real: this recomputes on every request rather than reading a cached flag,
 * bounded by the same 50-game cap `/games/mine` already uses (a real pagination need,
 * not a design flaw, if this app ever needs more than that).
 */
const DEFINITIONS: readonly AchievementDefinition[] = [
  { id: 'first_win', title: 'First Win', description: 'Win an online game.', icon: '🏆' },
  { id: 'first_capture', title: 'First Blood', description: "Capture an opponent's chip in an online game.", icon: '⚔️' },
  { id: 'first_dama', title: 'Crowned', description: 'Promote a chip to Dama in an online game.', icon: '♛' },
  { id: 'five_games', title: 'Regular', description: 'Play 5 online games.', icon: '🎮' },
  { id: 'ten_wins', title: 'Veteran', description: 'Win 10 online games.', icon: '🥇' },
];

interface GameFacts {
  won: boolean;
  hadCapture: boolean;
  hadPromotion: boolean;
}

/**
 * Replays one game move by move (not just to its final state, unlike `history.ts`'s
 * `summarize`) — a promotion is a transient event only visible by diffing each step, not
 * something the final board state alone can prove happened along the way.
 */
function computeGameFacts<V>(game: PersistedGame, variant: Variant<V>, userId: string): GameFacts {
  const myColor: Player | null = game.players.white === userId ? 'white' : game.players.black === userId ? 'black' : null;
  const moves = game.moveHistory as Move<V>[];

  let state = createGame(variant);
  let hadCapture = false;
  let hadPromotion = false;
  for (const move of moves) {
    const mover = state.turn;
    const before = pieceAt(state.board, move.from);
    const next = applyMove(state, move, variant, { checkGameOver: false });
    if (mover === myColor) {
      if (move.captures.length > 0) hadCapture = true;
      const after = pieceAt(next.board, move.to);
      if (before && after && !before.isDama && after.isDama) hadPromotion = true;
    }
    state = next;
  }

  const isOver = game.status === 'finished' || game.resignedBy !== null || game.drawnByAgreement;
  let winner: Player | null = null;
  if (isOver) {
    if (game.resignedBy) winner = game.resignedBy === 'white' ? 'black' : 'white';
    else if (!game.drawnByAgreement) {
      const finals = finalScores(state, variant.arithmetic);
      const order = variant.arithmetic.compare(finals.white, finals.black);
      winner = order > 0 ? 'white' : order < 0 ? 'black' : null;
    }
  }

  return { won: winner !== null && winner === myColor, hadCapture, hadPromotion };
}

/** Computes every badge's unlocked/locked state for `userId`, from their own online-game history alone — nothing else needed as input. */
export async function computeAchievements(userId: string, gameStore: GameStore): Promise<Achievement[]> {
  const games = await gameStore.listForUser(userId, 50);

  let wins = 0;
  let anyCapture = false;
  let anyPromotion = false;
  for (const game of games) {
    const variant = findVariant(game.variantId) as AnyVariant | null;
    if (!variant) continue; // defensive only, same reasoning as history.ts's summarize
    type V = ValueOf<AnyVariant>;
    const facts = computeGameFacts(game, variant as Variant<V>, userId);
    if (facts.won) wins += 1;
    if (facts.hadCapture) anyCapture = true;
    if (facts.hadPromotion) anyPromotion = true;
  }

  const unlocked: Record<string, boolean> = {
    first_win: wins >= 1,
    first_capture: anyCapture,
    first_dama: anyPromotion,
    five_games: games.length >= 5,
    ten_wins: wins >= 10,
  };

  return DEFINITIONS.map((def) => ({ ...def, unlocked: unlocked[def.id] ?? false }));
}
