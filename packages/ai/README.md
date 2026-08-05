# @damath/ai

Minimax with alpha-beta pruning for Damath — deterministic, testable, and free, per
`docs/AI_OPPONENT.md`. Depends only on `@damath/engine`. No I/O, no framework, no
hidden timers — the only I/O-adjacent value (the clock) is injected.

Plays the three integer variants only (Whole, Counting, Integer) — an evaluation
function needs a numeric scale, and Fraction/Radical/Polynomial don't have one yet.

## Quick start

```ts
import { chooseMove, tierOptions } from '@damath/ai';
import { createGame, applyMove } from '@damath/engine';

let state = createGame('integer');
const result = chooseMove(state, tierOptions('steady', /* seed */ 1));
state = applyMove(state, result.move);
```

## Public API

- **`chooseMove(state, opts, clock?, weights?): SearchResult`** — iterative-deepening
  alpha-beta search, pure and, given `opts.seed`, deterministic. Always returns the
  best move from the last depth that finished within `opts.timeBudgetMs`; a depth that
  started but didn't finish is discarded entirely, never trusted partially. `weights`
  defaults to `DEFAULT_WEIGHTS` and exists mainly for `test/self-play-weights.test.ts`
  to run the F1 comparison — not part of `SearchOptions` since the doc's given
  interface doesn't include it.
- **`evaluate(state, player, weights?): number`** — the heuristic from
  `docs/AI_OPPONENT.md` §5: banked score differential dominates (the actual win
  condition, §8.3), with small terms for on-board value (Dama doubled), promotion
  proximity, exposure (own pieces currently capturable), and mobility. At a terminal
  position, returns the *exact* `finalScores` differential rather than an
  approximation.
- **`DEFAULT_WEIGHTS`** / **`MATERIAL_HEAVY_WEIGHTS`** — the second is `reference/`'s
  actual F1 bug (material weighted over score), kept only so
  `test/self-play-weights.test.ts` can demonstrate why it's wrong; no tier uses it.
- **`TIERS`** / **`tierOptions(tier, seed?)`** — the four difficulty presets from §7
  (`learner`/`steady`/`sharp`/`tournament`): depth, time budget, and blunder rate.
  Difficulty is depth and deliberate imperfection, never cheating — every tier sees
  exactly what `legalMoves()` returns.
- **`handleAiRequest(request): AiWorkerResponse`** — the Web Worker's actual logic, as
  a plain function (testable without a real Worker or DOM). `src/worker.ts` is the
  thin adapter Vite bundles as the real worker entry — see `apps/web`'s
  `ai-worker-entry.ts` and `useComputerOpponent` hook for how the browser side wires
  it up (§3, §9 "Practice mode": runs entirely client-side, never blocks the UI
  thread, works offline).
- **`createRng(seed)`** — the deterministic PRNG (mulberry32) every source of search
  randomness (tie-break shuffling, blunder selection) runs through.

### Types

`SearchOptions`, `SearchResult`, `Clock`, `SupportedVariantId`, `EvaluationWeights`,
`DifficultyTier`, `AiWorkerRequest`, `AiWorkerResponse` — see `src/types.ts`,
`src/evaluate.ts`, `src/tiers.ts`, `src/worker-protocol.ts`.

## What's deliberately different from `reference/`

`docs/AI_OPPONENT.md` reviews `reference/damath-engine/backend/ai/` in detail before
prescribing fixes (F1–F6). Summary of what changed here:

- **Score dominates material** (F1) — the reference weighted banked score at 0.5 and
  material at 1.0, backwards for a game whose win condition is score, not piece count.
- **Deterministic given a seed** (F2) — `random.shuffle` with no seed is gone; every
  random choice runs through a seeded PRNG.
- **Dama multiplier matches the rules** (F3) — evaluation weights Dama the same ×2 the
  rules actually use, not an unrelated ×3.
- **Move order carries across iterative-deepening depths** (F4) — each depth's search
  seeds its move ordering with the previous depth's best move (the principal
  variation), instead of restarting from scratch every depth.
- **Quiescence, adapted to this engine's move model** (F5) — the engine already
  resolves an entire capture chain as one atomic `Move`, so there's no literal
  "mid-chain" state to extend through the way the reference needed. What's left is the
  ordinary horizon effect: search extends a few plies past the nominal depth while the
  position is a mandatory capture, so it doesn't evaluate right before a forced
  exchange it can't yet see.

## Testing

```bash
pnpm -F @damath/ai test
pnpm -F @damath/ai test:coverage
```

`test/tier-ordering.test.ts` and `test/self-play-weights.test.ts` play real games
between search configurations — they're the slowest files in the suite (tens of
seconds) but fully deterministic on fixed seeds. See `KNOWLEDGE.md` for what those
self-play runs found (a real, substantial white-side advantage in this
evaluation/depth regime, and why the tier-ordering assertions use aggregate score
margin rather than raw win count for the closer adjacent-tier gaps).
