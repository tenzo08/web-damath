import { describe, expect, it } from 'vitest';
import { createGame } from '@damath/engine';
import * as ai from '../src/index.js';

describe('public API surface', () => {
  it('exports a working chooseMove + tierOptions pair', () => {
    const state = createGame('whole');
    const result = ai.chooseMove(state, ai.tierOptions('learner', 1));
    expect(result.move).toBeDefined();
  });

  it('exports the evaluation and RNG primitives', () => {
    const state = createGame('whole');
    expect(typeof ai.evaluate(state, 'white')).toBe('number');
    const rng = ai.createRng(1);
    expect(typeof rng()).toBe('number');
    expect(typeof ai.randomInt(rng, 10)).toBe('number');
  });

  it('exports the four tiers and the worker request handler', () => {
    expect(Object.keys(ai.TIERS)).toEqual(['learner', 'steady', 'sharp', 'tournament']);
    const response = ai.handleAiRequest({ id: 'x', state: createGame('whole'), tier: 'learner', seed: 1 });
    expect(response.id).toBe('x');
  });
});
