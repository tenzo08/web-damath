import { describe, expect, it } from 'vitest';
import { createGame, INTEGER_DAMATH } from '@damath/engine';
import { handleAiRequest } from '../src/worker-protocol.js';

describe('handleAiRequest (the worker\'s logic, without a real Worker)', () => {
  it('resolves a tier + optional seed into a search result under the same request id', () => {
    const state = createGame(INTEGER_DAMATH);
    const response = handleAiRequest({ id: 'req-1', state, tier: 'learner', seed: 42 });
    expect(response.id).toBe('req-1');
    expect(response.result.move).toBeDefined();
    expect(response.result.depth).toBeGreaterThan(0);
  });

  it('is deterministic given the same seed', () => {
    const state = createGame(INTEGER_DAMATH);
    const a = handleAiRequest({ id: 'a', state, tier: 'steady', seed: 7 });
    const b = handleAiRequest({ id: 'b', state, tier: 'steady', seed: 7 });
    expect(a.result.move).toEqual(b.result.move);
  });

  it('an explicit `options` override bypasses the tier preset entirely', () => {
    const state = createGame(INTEGER_DAMATH);
    // 'learner' presets maxDepth 2 -- an explicit override to depth 1 must win, proving
    // `options` (not `tier`) drove the actual search.
    const response = handleAiRequest({ id: 'review-1', state, tier: 'learner', options: { maxDepth: 1, timeBudgetMs: 200, blunderRate: 0 } });
    expect(response.result.depth).toBe(1);
  });
});
