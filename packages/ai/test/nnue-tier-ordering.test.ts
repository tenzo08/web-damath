import { describe, expect, it } from 'vitest';
import { ALL_VARIANTS } from '@damath/engine';
import type { Variant } from '@damath/engine';
import { playGame, type Contestant } from './self-play.js';
import { loadNnueWeights } from '../src/nnueEval.js';
import type { NnueBlend } from '../src/evaluate.js';

/** Same budgets tier-ordering.test.ts already verified are generous enough for iterative deepening to actually complete its nominal depth — see that file's comment for the empirical history. */
const LEARNER = { maxDepth: 2, timeBudgetMs: 80, blunderRate: 0.25 } as const;
const TOURNAMENT = { maxDepth: 8, timeBudgetMs: 450, blunderRate: 0 } as const;

/**
 * Moderate, non-dominant influence — `evaluate.ts`'s `weights.score` term (1) still
 * dominates the exact score differential; this just lets the trained network nudge the
 * ranking, matching `NnueBlend`'s own "strictly additive" doc comment. An untrained
 * (all-zero) placeholder weight file always outputs 0 here by construction, so this
 * degrades to exactly the plain-heuristic tier-ordering property `tier-ordering.test.ts`
 * already proves — this test only starts exercising genuine learned evaluation once
 * `training/train.py` has actually run for a given variant.
 */
const BLEND_WEIGHT = 0.3;
const GAMES = 8;

type ValueOf<T> = T extends Variant<infer V> ? V : never;

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Mirrors tier-ordering.test.ts's `contest()` exactly (aggregate score margin, alternating colors) — generalized over `Variant<V>` and an `NnueBlend` both contestants share. */
function contest<V>(variant: Variant<V>, nnue: NnueBlend, games: number, seedBase: number) {
  let strongerMargin = 0;
  let strongerWins = 0;
  let weakerWins = 0;
  for (let i = 0; i < games; i++) {
    const strongerIsWhite = i % 2 === 0;
    const stronger: Contestant = { opts: { ...TOURNAMENT, seed: seedBase + i }, nnue };
    const weaker: Contestant = { opts: { ...LEARNER, seed: seedBase + 1000 + i }, nnue };
    const outcome = playGame(variant, strongerIsWhite ? stronger : weaker, strongerIsWhite ? weaker : stronger);
    const strongerScore = strongerIsWhite ? outcome.finalScores.white : outcome.finalScores.black;
    const weakerScore = strongerIsWhite ? outcome.finalScores.black : outcome.finalScores.white;
    strongerMargin += strongerScore - weakerScore;
    const strongerWon = (strongerIsWhite && outcome.winner === 'white') || (!strongerIsWhite && outcome.winner === 'black');
    const weakerWon = (strongerIsWhite && outcome.winner === 'black') || (!strongerIsWhite && outcome.winner === 'white');
    if (strongerWon) strongerWins++;
    else if (weakerWon) weakerWins++;
  }
  return { strongerMargin, strongerWins, weakerWins };
}

describe('per-variant depth ordering with the NNUE blend active (docs/AI_OPPONENT.md §8, extended per variant)', () => {
  for (const variant of ALL_VARIANTS) {
    it(
      `[${variant.id}] tournament tier (depth 8) beats learner tier (depth 2) on aggregate score margin, NNUE-blended`,
      async () => {
        const weights = await loadNnueWeights(variant.id);
        expect(weights).not.toBeNull();
        if (!weights) return; // unreachable -- asserted above; narrows for the call below
        const nnue: NnueBlend = { weights, blendWeight: BLEND_WEIGHT };
        const typedVariant = variant as unknown as Variant<ValueOf<typeof variant>>;
        const { strongerMargin, strongerWins, weakerWins } = contest(typedVariant, nnue, GAMES, hashSeed(variant.id));
        expect(strongerMargin).toBeGreaterThan(0);
        expect(strongerWins).toBeGreaterThanOrEqual(weakerWins);
      },
      60_000,
    );
  }
});
