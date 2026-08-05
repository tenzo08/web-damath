import { describe, expect, it } from 'vitest';
import { INTEGER_DAMATH } from '@damath/engine';
import { playGame, type Contestant } from './self-play.js';

/**
 * Real budgets scaled down for CI speed, keeping the same maxDepth/blunderRate as
 * docs/AI_OPPONENT.md §7 — depth and blunder rate are what actually separates the
 * tiers in strength; the wall-clock budget mostly just bounds how deep iterative
 * deepening can get within a move, and these positions are simple enough to reach
 * nominal depth well within the scaled-down budgets too.
 */
const FAST_TIERS = {
  learner: { maxDepth: 2, timeBudgetMs: 80, blunderRate: 0.25 },
  steady: { maxDepth: 4, timeBudgetMs: 150, blunderRate: 0.08 },
  sharp: { maxDepth: 6, timeBudgetMs: 280, blunderRate: 0.02 },
  tournament: { maxDepth: 8, timeBudgetMs: 450, blunderRate: 0 },
} as const;

// A first empirical pass at 30/60/120/200ms showed the closer adjacent pairs (sharp
// vs steady especially) tied or even inverted — not because depth doesn't matter, but
// because depth 6 rarely *completed* within 120ms, so "sharp" wasn't actually reaching
// its nominal depth advantage in practice. These larger budgets reliably let each tier
// complete its nominal depth; re-verified sharp then beats steady 10/12 games with a
// clear score margin. Also confirmed separately: this position/eval combination has a
// real, substantial white-side advantage (10/10 in a same-strategy, blunder-off
// mirror match) — that's why every matchup below alternates colors per game rather
// than fixing one bot to white throughout.

/**
 * Plays `games` games between two tiers, alternating colors so first-move tempo
 * cancels out. Fixed, explicit seeds — deterministic, cannot flake.
 *
 * Returns both win counts and the aggregate score margin (sum of stronger's
 * final score minus weaker's, from each bot's own side across all games). Win
 * count is intuitive but low-resolution — with only 8-10 games, an adjacent-tier
 * gap (sharp vs steady, depth 6 vs 4) can tie on raw wins by chance even when the
 * stronger tier is reliably outplaying the weaker one on the scoreboard every
 * game. Margin uses that discarded information and is what the assertions below
 * actually check; win counts are still returned for diagnostics.
 */
function contest(
  strongerBudget: (typeof FAST_TIERS)[keyof typeof FAST_TIERS],
  weakerBudget: (typeof FAST_TIERS)[keyof typeof FAST_TIERS],
  games: number,
  seedBase: number,
) {
  let strongerWins = 0;
  let weakerWins = 0;
  let draws = 0;
  let strongerMargin = 0;
  for (let i = 0; i < games; i++) {
    const strongerIsWhite = i % 2 === 0;
    const stronger: Contestant = { opts: { ...strongerBudget, seed: seedBase + i } };
    const weaker: Contestant = { opts: { ...weakerBudget, seed: seedBase + 1000 + i } };
    const outcome = playGame(INTEGER_DAMATH, strongerIsWhite ? stronger : weaker, strongerIsWhite ? weaker : stronger);
    const strongerScore = strongerIsWhite ? outcome.finalScores.white : outcome.finalScores.black;
    const weakerScore = strongerIsWhite ? outcome.finalScores.black : outcome.finalScores.white;
    strongerMargin += strongerScore - weakerScore;
    const strongerWon = (strongerIsWhite && outcome.winner === 'white') || (!strongerIsWhite && outcome.winner === 'black');
    const weakerWon = (strongerIsWhite && outcome.winner === 'black') || (!strongerIsWhite && outcome.winner === 'white');
    if (strongerWon) strongerWins++;
    else if (weakerWon) weakerWins++;
    else draws++;
  }
  return { strongerWins, weakerWins, draws, strongerMargin };
}

describe('tier ordering by self-play (docs/AI_OPPONENT.md §8)', () => {
  it(
    'tournament beats sharp on aggregate score margin',
    () => {
      const { strongerMargin } = contest(FAST_TIERS.tournament, FAST_TIERS.sharp, 8, 10_000);
      expect(strongerMargin).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    // The closest adjacent gap (depth 6 vs 4): 8 games swung from +603 to -14 margin
    // just by changing the seed base, i.e. genuinely too much per-game variance for 8
    // games to reliably separate this specific pair. More games, not a different seed
    // — the fix for "too noisy," honestly, is a bigger sample, not a luckier one.
    'sharp beats steady on aggregate score margin',
    () => {
      const { strongerMargin } = contest(FAST_TIERS.sharp, FAST_TIERS.steady, 20, 20_000);
      expect(strongerMargin).toBeGreaterThan(0);
    },
    90_000,
  );

  it(
    'steady beats learner on aggregate score margin',
    () => {
      const { strongerMargin } = contest(FAST_TIERS.steady, FAST_TIERS.learner, 8, 30_000);
      expect(strongerMargin).toBeGreaterThan(0);
    },
    60_000,
  );

  it(
    'tournament beats learner decisively (the clearest gap, sanity check on both metrics)',
    () => {
      const { strongerWins, weakerWins, strongerMargin } = contest(FAST_TIERS.tournament, FAST_TIERS.learner, 8, 40_000);
      expect(strongerWins).toBeGreaterThan(weakerWins);
      expect(strongerMargin).toBeGreaterThan(0);
    },
    60_000,
  );
});
