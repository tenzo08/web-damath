import type { DifficultyTier } from '@damath/ai';
import type { Player } from '@damath/engine';

/** Every account's rating on signup — the conventional Elo starting point. */
export const STARTING_RATING = 1200;

/**
 * A single fixed K-factor (32, the common default for players who aren't yet
 * established — FIDE and most online platforms use something in this range) rather
 * than a K that decays with games played. Simpler, still a correct, standard Elo
 * implementation; a decaying K is a reasonable future refinement, not required for a
 * working rating system.
 */
const K_FACTOR = 32;

/**
 * How many games (against the computer, docs/AI_OPPONENT.md §9's queue-fallback path)
 * a new account plays before it's allowed into ordinary human queue-matchmaking
 * (rooms.ts's `enqueue`) — the "the system should check the level of the player first"
 * placement window. `PLACEMENT_TIER` is fixed at `steady`, not configurable per
 * deployment like `QUEUE_BOT_TIER`: it needs to be the same fair baseline for every new
 * account's calibration games, not whatever bot strength ops happens to have dialed in
 * for ordinary queue-fallback.
 */
export const PLACEMENT_GAMES_REQUIRED = 3;
export const PLACEMENT_TIER: DifficultyTier = 'steady';

/** Double the normal K-factor while an account is still in its placement window — the rating should move fast toward an accurate value before there's enough game history for the standard K=32 read to mean much, the same reasoning FIDE/USCF-style "provisional rating" periods use a higher K for. */
export const PLACEMENT_K_FACTOR = 64;

/**
 * Notional ratings for each AI difficulty tier (docs/AI_OPPONENT.md §2) — playing the
 * computer updates your rating exactly like playing a human does, against this fixed
 * opponent "rating" instead of a real account's. Spaced 400 points apart, matching the
 * Elo convention that a 400-point gap implies roughly a 10:1 win expectancy.
 */
export const BOT_TIER_RATING: Record<DifficultyTier, number> = {
  learner: 800,
  steady: 1200,
  sharp: 1600,
  tournament: 2000,
};

export type MatchOutcome = 'win' | 'loss' | 'draw';

/** The standard logistic Elo expectation: how likely `ratingA` is to beat `ratingB`, as a value in (0, 1). `expectedScore(a, b) + expectedScore(b, a) === 1` always. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** One player's new rating after one game, given their outcome against `opponentRating`. `kFactor` defaults to the standard 32; callers pass `PLACEMENT_K_FACTOR` while the account is still within its placement window. */
export function nextRating(rating: number, opponentRating: number, outcome: MatchOutcome, kFactor: number = K_FACTOR): number {
  const actual = outcome === 'win' ? 1 : outcome === 'loss' ? 0 : 0.5;
  const expected = expectedScore(rating, opponentRating);
  return Math.round(rating + kFactor * (actual - expected));
}

/**
 * Both players' new ratings after one game, from the same `Player`/`winner` shape
 * `room.ts`'s `PublicGameView` already uses — `winner: null` is a draw. Zero-sum by
 * construction (one side's gain exactly equals the other's loss), since
 * `expectedScore(a, b) + expectedScore(b, a) === 1` and `actualWhite + actualBlack ===
 * 1` for every possible outcome including a draw. Each side's K-factor is independent —
 * one account can be in its placement window while the other isn't (a direct-invite
 * room bypasses the queue's placement gate, so this does happen in practice).
 */
export function nextRatings(
  ratingWhite: number,
  ratingBlack: number,
  winner: Player | null,
  kFactorWhite: number = K_FACTOR,
  kFactorBlack: number = K_FACTOR,
): { white: number; black: number } {
  const outcomeFor = (player: Player): MatchOutcome => (winner === null ? 'draw' : winner === player ? 'win' : 'loss');
  return {
    white: nextRating(ratingWhite, ratingBlack, outcomeFor('white'), kFactorWhite),
    black: nextRating(ratingBlack, ratingWhite, outcomeFor('black'), kFactorBlack),
  };
}
