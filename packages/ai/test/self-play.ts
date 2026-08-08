import { applyMove, createGame, finalScores, isGameOver } from '@damath/engine';
import type { Player, Variant } from '@damath/engine';
import { chooseMove } from '../src/search.js';
import type { EvaluationWeights, NnueBlend } from '../src/evaluate.js';
import type { SearchOptions } from '../src/types.js';
import { toNumberFor } from '../src/valueScale.js';

export interface Contestant {
  readonly opts: SearchOptions;
  readonly weights?: EvaluationWeights;
  /** Opt-in NNUE blend (already-loaded weights) — `test/nnue-tier-ordering.test.ts` uses this; every other existing caller omits it. */
  readonly nnue?: NnueBlend;
}

export interface GameOutcome {
  readonly winner: Player | 'draw';
  readonly finalScores: Record<Player, number>;
  readonly plies: number;
}

/**
 * Plays one full game between two search configurations, alternating real moves
 * through the engine's public `applyMove` (the actual game loop, not search's
 * internal `checkGameOver: false` shortcut — self-play must detect real game-over,
 * repetition included). Capped at `maxPlies` as a backstop against a pathological
 * non-terminating line; ordinary Damath games end well before that.
 */
export function playGame<V>(variant: Variant<V>, white: Contestant, black: Contestant, maxPlies = 150): GameOutcome {
  const toNumber = toNumberFor<V>(variant.id);
  let state = createGame(variant);
  let plies = 0;
  while (!isGameOver(state, variant) && plies < maxPlies) {
    const mover = state.turn === 'white' ? white : black;
    const result = chooseMove(state, mover.opts, undefined, mover.weights, mover.nnue);
    state = applyMove(state, result.move, variant);
    plies++;
  }
  const exact = finalScores(state, variant.arithmetic);
  const scores: Record<Player, number> = { white: toNumber(exact.white), black: toNumber(exact.black) };
  const winner: Player | 'draw' = scores.white === scores.black ? 'draw' : scores.white > scores.black ? 'white' : 'black';
  return { winner, finalScores: scores, plies };
}
