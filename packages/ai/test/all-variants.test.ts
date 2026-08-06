import { describe, expect, it } from 'vitest';
import { ALL_VARIANTS, createGame } from '@damath/engine';
import { chooseMove } from '../src/search.js';
import { playGame, type Contestant } from './self-play.js';

/**
 * docs/AI_OPPONENT.md originally scoped the AI to Whole/Counting/Integer because an
 * evaluation function needs a numeric scale and Fraction/Radical/Polynomial chip
 * values don't have one natively. valueScale.ts's `ToNumber<V>` bridge fixes that —
 * this file is the sanity check referenced from evaluate.ts's `DEFAULT_WEIGHTS`
 * comment: every variant must produce legal play, and the search must still get
 * measurably stronger with more search budget, on every variant, not just the three
 * integer ones.
 */
describe('AI plays every official variant (docs/AI_OPPONENT.md, revised scope)', () => {
  it.each(ALL_VARIANTS.map((v) => [v.id, v] as const))('chooses a legal move from the starting position (%s)', (_id, variant) => {
    const state = createGame(variant);
    const result = chooseMove(state, { maxDepth: 3, timeBudgetMs: 100, seed: 1 });
    expect(result.move).toBeDefined();
  });

  /**
   * Lightweight per docs/AI_OPPONENT.md's design discussion: one comparison per
   * variant (tournament vs. learner — the clearest strength gap, per
   * tier-ordering.test.ts), reusing `DEFAULT_WEIGHTS` as-is rather than re-tuning
   * per variant. Not exhaustive tier-ordering coverage — that already exists for
   * INTEGER_DAMATH in tier-ordering.test.ts; this only confirms the new
   * `ToNumber<V>` bridges actually produce a working, improving search on chip
   * values that aren't plain numbers.
   */
  const LIGHT_TIERS = {
    learner: { maxDepth: 2, timeBudgetMs: 60, blunderRate: 0.25 },
    tournament: { maxDepth: 6, timeBudgetMs: 250, blunderRate: 0 },
  } as const;

  const nonIntegerVariants = ALL_VARIANTS.filter((v) => v.id === 'fraction' || v.id === 'rational' || v.id === 'radical' || v.id === 'polynomial');

  it.each(nonIntegerVariants.map((v) => [v.id, v] as const))(
    'tournament tier beats learner tier on aggregate score margin (%s)',
    (_id, variant) => {
      let margin = 0;
      const games = 6;
      for (let i = 0; i < games; i++) {
        const tournamentIsWhite = i % 2 === 0;
        const tournament: Contestant = { opts: { ...LIGHT_TIERS.tournament, seed: 100 + i } };
        const learner: Contestant = { opts: { ...LIGHT_TIERS.learner, seed: 1100 + i } };
        const outcome = playGame(variant, tournamentIsWhite ? tournament : learner, tournamentIsWhite ? learner : tournament);
        const tournamentScore = tournamentIsWhite ? outcome.finalScores.white : outcome.finalScores.black;
        const learnerScore = tournamentIsWhite ? outcome.finalScores.black : outcome.finalScores.white;
        margin += tournamentScore - learnerScore;
      }
      expect(margin).toBeGreaterThan(0);
    },
    30_000,
  );
});
