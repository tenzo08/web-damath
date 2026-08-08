import { describe, expect, it } from 'vitest';
import { createGame, INTEGER_DAMATH } from '@damath/engine';
import { handleAiRequest } from '../src/worker-protocol.js';

describe('handleAiRequest (the worker\'s logic, without a real Worker)', () => {
  it('resolves a tier + optional seed into a search result under the same request id', async () => {
    const state = createGame(INTEGER_DAMATH);
    const response = await handleAiRequest({ id: 'req-1', state, tier: 'learner', seed: 42 });
    expect(response.id).toBe('req-1');
    expect(response.result.move).toBeDefined();
    expect(response.result.depth).toBeGreaterThan(0);
  });

  it('is deterministic given the same seed', async () => {
    const state = createGame(INTEGER_DAMATH);
    const a = await handleAiRequest({ id: 'a', state, tier: 'steady', seed: 7 });
    const b = await handleAiRequest({ id: 'b', state, tier: 'steady', seed: 7 });
    expect(a.result.move).toEqual(b.result.move);
  });

  it('an explicit `options` override bypasses the tier preset entirely', async () => {
    const state = createGame(INTEGER_DAMATH);
    // 'learner' presets maxDepth 2 -- an explicit override to depth 1 must win, proving
    // `options` (not `tier`) drove the actual search.
    const response = await handleAiRequest({ id: 'review-1', state, tier: 'learner', options: { maxDepth: 1, timeBudgetMs: 200, blunderRate: 0 } });
    expect(response.result.depth).toBe(1);
  });

  it('loads and blends the trained NNUE evaluator for a tier with a nonzero blend weight', async () => {
    const state = createGame(INTEGER_DAMATH);
    // 'tournament' has the highest NNUE_BLEND_WEIGHTS entry -- this exercises the async
    // weight-load path end to end (a committed real weight file, not a mock).
    const response = await handleAiRequest({ id: 'nnue-1', state, tier: 'tournament', seed: 1, options: { maxDepth: 2, timeBudgetMs: 200, blunderRate: 0 } });
    expect(response.result.move).toBeDefined();
  });
});
