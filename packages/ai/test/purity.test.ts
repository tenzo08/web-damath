import { describe, expect, it } from 'vitest';
import { createGame } from '@damath/engine';
import { chooseMove } from '../src/search.js';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('purity (docs/AI_OPPONENT.md §8)', () => {
  it('search never mutates a deep-frozen input state', () => {
    const state = createGame('integer');
    const before = structuredClone(state);
    deepFreeze(state);

    expect(() => chooseMove(state, { maxDepth: 4, timeBudgetMs: 300, seed: 1 })).not.toThrow();
    expect(state).toEqual(before);
  });
});
