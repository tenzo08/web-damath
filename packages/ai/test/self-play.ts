import { applyMove, createGame, finalScores, isGameOver } from '@damath/engine';
import type { Player, SupportedVariantId } from '@damath/engine';
import { chooseMove } from '../src/search.js';
import type { EvaluationWeights } from '../src/evaluate.js';
import type { SearchOptions } from '../src/types.js';

export interface Contestant {
  readonly opts: SearchOptions;
  readonly weights?: EvaluationWeights;
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
export function playGame(
  variantId: SupportedVariantId,
  white: Contestant,
  black: Contestant,
  maxPlies = 150,
): GameOutcome {
  let state = createGame(variantId);
  let plies = 0;
  while (!isGameOver(state) && plies < maxPlies) {
    const mover = state.turn === 'white' ? white : black;
    const result = chooseMove(state, mover.opts, undefined, mover.weights);
    state = applyMove(state, result.move);
    plies++;
  }
  const scores = finalScores(state);
  const winner: Player | 'draw' = scores.white === scores.black ? 'draw' : scores.white > scores.black ? 'white' : 'black';
  return { winner, finalScores: scores, plies };
}
