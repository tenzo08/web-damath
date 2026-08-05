import { describe, expect, it } from 'vitest';
import { createGame } from '@damath/engine';
import { handleAiRequest } from '../src/worker-protocol.js';

describe('handleAiRequest (the worker\'s logic, without a real Worker)', () => {
  it('resolves a tier + optional seed into a search result under the same request id', () => {
    const state = createGame('integer');
    const response = handleAiRequest({ id: 'req-1', state, tier: 'learner', seed: 42 });
    expect(response.id).toBe('req-1');
    expect(response.result.move).toBeDefined();
    expect(response.result.depth).toBeGreaterThan(0);
  });

  it('is deterministic given the same seed', () => {
    const state = createGame('integer');
    const a = handleAiRequest({ id: 'a', state, tier: 'steady', seed: 7 });
    const b = handleAiRequest({ id: 'b', state, tier: 'steady', seed: 7 });
    expect(a.result.move).toEqual(b.result.move);
  });
});
