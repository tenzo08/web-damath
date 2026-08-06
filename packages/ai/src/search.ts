import { applyMove, legalMoves } from '@damath/engine';
import type { GameState, Move, Variant } from '@damath/engine';
import { DEFAULT_WEIGHTS, evaluate, type EvaluationWeights } from './evaluate.js';
import { orderMoves } from './ordering.js';
import { createRng } from './rng.js';
import type { Clock, SearchOptions, SearchResult } from './types.js';
import { resolveVariant } from './variant.js';
import type { ToNumber } from './valueScale.js';

/**
 * How many extra plies to search past the nominal depth while the position is a
 * mandatory capture (§4.2) — adapted quiescence (§6, fixing F5): this engine already
 * resolves an entire capture chain as one atomic `Move` (`captureSequences` recurses
 * fully before `legalMoves` returns), so there is no literal "mid-chain" state to
 * extend through the way the Python reference needed. What's left is the ordinary
 * horizon effect: cutting off right before a forced exchange plays out. Extending
 * through consecutive forced-capture positions (bounded, since captures remove
 * pieces and the budget is finite either way) keeps the AI from evaluating a
 * position moments before an unavoidable capture it can't yet see.
 */
const QUIESCENCE_BUDGET = 6;

interface SearchContext<V> {
  readonly weights: EvaluationWeights;
  readonly clock: Clock;
  readonly deadline: number;
  readonly rng: () => number;
  readonly variant: Variant<V>;
  readonly toNumber: ToNumber<V>;
  nodesEvaluated: number;
}

function isForcedCapture<V>(moves: readonly Move<V>[]): boolean {
  const first = moves[0];
  return first !== undefined && first.captures.length > 0;
}

function leaf<V>(state: GameState<V>, ctx: SearchContext<V>, player: GameState<V>['turn']): number {
  ctx.nodesEvaluated++;
  return evaluate(state, player, ctx.variant, ctx.toNumber, ctx.weights);
}

/**
 * Standard alpha-beta over a fixed-perspective `evaluate` (`rootPlayer`), alternating
 * maximizing/minimizing with `state.turn` — valid because every move in this engine
 * switches turn exactly once (chain captures are one atomic Move), so ply depth and
 * turn alternation always agree.
 */
function alphaBeta<V>(
  state: GameState<V>,
  depth: number,
  quiescenceBudget: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  rootPlayer: GameState<V>['turn'],
  ctx: SearchContext<V>,
): number {
  if (ctx.clock() > ctx.deadline) {
    return leaf(state, ctx, rootPlayer);
  }

  const moves = legalMoves(state);
  if (moves.length === 0) {
    return leaf(state, ctx, rootPlayer); // terminal — evaluate() returns the exact final-score differential
  }

  const atHorizon = depth <= 0;
  if (atHorizon && !(isForcedCapture(moves) && quiescenceBudget > 0)) {
    return leaf(state, ctx, rootPlayer);
  }
  const nextDepth = atHorizon ? depth : depth - 1;
  const nextBudget = atHorizon ? quiescenceBudget - 1 : quiescenceBudget;

  const ordered = orderMoves(state, moves, ctx.variant, ctx.toNumber, ctx.rng, null);

  if (maximizing) {
    let best = -Infinity;
    for (const move of ordered) {
      const child = applyMove(state, move, ctx.variant, { checkGameOver: false });
      const value = alphaBeta(child, nextDepth, nextBudget, alpha, beta, false, rootPlayer, ctx);
      if (value > best) best = value;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of ordered) {
    const child = applyMove(state, move, ctx.variant, { checkGameOver: false });
    const value = alphaBeta(child, nextDepth, nextBudget, alpha, beta, true, rootPlayer, ctx);
    if (value < best) best = value;
    if (best < beta) beta = best;
    if (beta <= alpha) break;
  }
  return best;
}

interface RankedMove<V> {
  readonly move: Move<V>;
  readonly value: number;
}

/**
 * Searches every root move to `depth` and returns them ranked best-first. Unlike
 * interior nodes, the root never has an outer beta bound to prune against, so every
 * direct child gets a genuine, comparable value — this ranked list is what makes the
 * blunder mechanic (§7) possible: it needs a real second-best move, not just a
 * pruned bound.
 */
function searchRoot<V>(state: GameState<V>, depth: number, pv: Move<V> | null, ctx: SearchContext<V>): RankedMove<V>[] {
  const moves = legalMoves(state);
  const ordered = orderMoves(state, moves, ctx.variant, ctx.toNumber, ctx.rng, pv);
  const rootPlayer = state.turn;
  let alpha = -Infinity;
  const ranked: RankedMove<V>[] = [];
  for (const move of ordered) {
    const child = applyMove(state, move, ctx.variant, { checkGameOver: false });
    const value = alphaBeta(child, depth - 1, QUIESCENCE_BUDGET, alpha, Infinity, false, rootPlayer, ctx);
    ranked.push({ move, value });
    if (value > alpha) alpha = value;
  }
  ranked.sort((a, b) => b.value - a.value);
  return ranked;
}

const defaultClock: Clock = () => Date.now();

/**
 * Iterative deepening to `opts.maxDepth`, aborting at `opts.timeBudgetMs`. Always
 * returns the best move from the last *completed* depth (docs/AI_OPPONENT.md §6) —
 * a depth that started before the deadline but finished after it is discarded
 * entirely, never partially trusted.
 *
 * Pure and, given `opts.seed`, deterministic: the same `state` and `opts` always
 * produce the same move. Without an explicit seed, randomness (tie-break ordering,
 * blunder selection) is seeded from `Math.random()` once at the start, so unseeded
 * play still varies game to game — determinism is only guaranteed, and only needed,
 * when the caller supplies a seed (tests always do).
 *
 * Generic over `V`: every one of the seven official variants (docs/AI_OPPONENT.md §4,
 * revised) resolves its own `Variant<V>` and numeric-heuristic bridge via
 * `resolveVariant` — the actual win condition and on-board score stay exact
 * (`Arithmetic<V>`) throughout; only the internal search heuristic (`evaluate.ts`)
 * ever touches a plain-number approximation, and only to rank candidate moves.
 *
 * `weights` defaults to `DEFAULT_WEIGHTS` and isn't part of `SearchOptions` (matching
 * docs/AI_OPPONENT.md's given interface exactly) — it's exposed only so
 * `test/self-play-weights.test.ts` can run the F1 comparison against
 * `MATERIAL_HEAVY_WEIGHTS` without a second copy of the search.
 */
export function chooseMove<V>(
  state: GameState<V>,
  opts: SearchOptions,
  clock: Clock = defaultClock,
  weights: EvaluationWeights = DEFAULT_WEIGHTS,
): SearchResult<V> {
  const start = clock();
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed);
  const blunderRate = opts.blunderRate ?? 0;

  const { variant, toNumber } = resolveVariant<V>(state.variant);
  const ctx: SearchContext<V> = {
    weights,
    clock,
    deadline: start + opts.timeBudgetMs,
    rng,
    variant,
    toNumber,
    nodesEvaluated: 0,
  };

  const rootMoves = legalMoves(state);
  const only = rootMoves.length === 1 ? rootMoves[0] : undefined;
  if (rootMoves.length === 0) {
    throw new Error('chooseMove: no legal moves in this position');
  }
  if (only) {
    return { move: only, score: evaluate(state, state.turn, variant, toNumber, ctx.weights), depth: 0, nodesEvaluated: 0, timeMs: clock() - start };
  }

  let bestRanked: RankedMove<V>[] = orderMoves(state, rootMoves, variant, toNumber, rng, null).map((move) => ({ move, value: 0 }));
  let completedDepth = 0;

  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    if (clock() >= ctx.deadline) break;
    const pv = bestRanked[0]?.move ?? null;
    const ranked = searchRoot(state, depth, pv, ctx);
    if (clock() > ctx.deadline) break; // this depth may have been cut short mid-way — discard it
    bestRanked = ranked;
    completedDepth = depth;
  }

  let chosen = bestRanked[0];
  if (!chosen) throw new Error('chooseMove: unreachable — bestRanked is never empty when rootMoves is not');

  if (bestRanked.length > 1 && rng() < blunderRate) {
    const second = bestRanked[1];
    if (second) chosen = second;
  }

  return {
    move: chosen.move,
    score: chosen.value,
    depth: completedDepth,
    nodesEvaluated: ctx.nodesEvaluated,
    timeMs: clock() - start,
  };
}
