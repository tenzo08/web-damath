import { describe, expect, it } from 'vitest';
import { evaluateWithNnue, loadNnueWeights, nnueForward, type NnueWeights } from '../src/nnueEval.js';
import { numberToNumber } from '../src/valueScale.js';
import { NNUE_SQUARES } from '../src/nnueFeatures.js';
import { ordinary, stateWith } from './fixtures.js';

/** A tiny, hand-computable stand-in for the real 192/64/32/1 network — same shape rules (weights[j] dotted with input, plus bias), just small enough to check by hand. */
function tinyWeights(): NnueWeights {
  return {
    version: 1,
    inputSize: 2,
    w1: [
      [1, 0],
      [0, 1],
    ], // identity-ish, 2 -> 2
    b1: [0, 0],
    w2: [[1, 1]], // sum, 2 -> 1
    b2: [0],
    w3: [[2]], // double, 1 -> 1
    b3: [0.5],
  };
}

describe('nnueForward', () => {
  it('computes the exact forward pass for a small hand-checkable network', () => {
    const weights = tinyWeights();
    // input [3, -1] -> relu([3, -1]) = [3, 0] -> relu(3+0) = [3] -> tanh(3*2 + 0.5)
    const result = nnueForward(weights, new Float32Array([3, -1]));
    expect(result).toBeCloseTo(Math.tanh(6.5));
  });

  it('is bounded to [-1, 1] by the tanh output layer', () => {
    const weights = tinyWeights();
    const big = nnueForward(weights, new Float32Array([1000, 1000]));
    const small = nnueForward(weights, new Float32Array([-1000, -1000]));
    expect(big).toBeLessThanOrEqual(1);
    expect(small).toBeGreaterThanOrEqual(-1);
  });
});

describe('evaluateWithNnue', () => {
  it('sign-flips the White-relative output for a Black query', () => {
    const pos = NNUE_SQUARES[0];
    if (!pos) throw new Error('unreachable');
    const state = stateWith([[pos, ordinary('white', 6)]]);
    // An all-zero-weight network always outputs tanh(0) = 0 regardless of perspective —
    // use a network with a nonzero bias instead, so the sign-flip is actually observable.
    const weights: NnueWeights = {
      version: 1,
      inputSize: 192,
      w1: Array.from({ length: 64 }, () => new Array(192).fill(0)),
      b1: new Array(64).fill(0),
      w2: Array.from({ length: 32 }, () => new Array(64).fill(0)),
      b2: new Array(32).fill(0),
      w3: [new Array(32).fill(0)],
      b3: [0.3],
    };
    const white = evaluateWithNnue(weights, state, 'white', numberToNumber);
    const black = evaluateWithNnue(weights, state, 'black', numberToNumber);
    expect(white).toBeCloseTo(Math.tanh(0.3));
    expect(black).toBeCloseTo(-Math.tanh(0.3));
  });
});

describe('loadNnueWeights', () => {
  it('resolves a real committed weight file with the expected shape', async () => {
    const weights = await loadNnueWeights('whole');
    expect(weights).not.toBeNull();
    expect(weights?.inputSize).toBe(192);
    expect(weights?.w1).toHaveLength(64);
    expect(weights?.w3).toHaveLength(1);
  });

  it('caches the promise — a second call for the same variant does not re-import', async () => {
    const first = loadNnueWeights('counting');
    const second = loadNnueWeights('counting');
    expect(first).toBe(second);
    await first;
  });
});
