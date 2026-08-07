import { describe, expect, it } from 'vitest';
import { createGame } from '@damath/engine';
import { WHOLE_DAMATH } from '@damath/engine';
import { NNUE_INPUT_SIZE, NNUE_SQUARES, encodeNnueFeatures } from '../src/nnueFeatures.js';
import { numberToNumber } from '../src/valueScale.js';
import { dama, ordinary, stateWith } from './fixtures.js';

describe('encodeNnueFeatures', () => {
  it('has exactly 32 squares and a 192-dim output', () => {
    expect(NNUE_SQUARES).toHaveLength(32);
    expect(NNUE_INPUT_SIZE).toBe(192);
  });

  it('encodes an empty board as all zeros', () => {
    const state = stateWith([]);
    const features = encodeNnueFeatures(state, numberToNumber);
    expect(features).toHaveLength(192);
    expect(Array.from(features).every((v) => v === 0)).toBe(true);
  });

  it('encodes a single ordinary white piece at the correct square block', () => {
    const pos = NNUE_SQUARES[0];
    if (!pos) throw new Error('unreachable');
    const state = stateWith([[pos, ordinary('white', 6)]]);
    const features = encodeNnueFeatures(state, numberToNumber);

    expect(features[0]).toBe(1); // exists
    expect(features[1]).toBe(1); // owner white
    expect(features[2]).toBe(0); // owner black
    expect(features[3]).toBeCloseTo(6 / 12);
    expect(features[4]).toBe(0); // not dama
    // white advances toward row 7, so advancement = row / 7
    expect(features[5]).toBeCloseTo(pos.row / 7);

    // every other square's block stays zero
    expect(Array.from(features.slice(6)).every((v) => v === 0)).toBe(true);
  });

  it('encodes a black dama with advancement measured toward row 0', () => {
    const pos = NNUE_SQUARES[10];
    if (!pos) throw new Error('unreachable');
    const state = stateWith([[pos, dama('black', 3)]]);
    const features = encodeNnueFeatures(state, numberToNumber);
    const base = 10 * 6;

    expect(features[base + 1]).toBe(0); // owner white
    expect(features[base + 2]).toBe(1); // owner black
    expect(features[base + 4]).toBe(1); // is dama
    expect(features[base + 5]).toBeCloseTo((7 - pos.row) / 7);
  });

  it('produces a finite feature vector for the real starting position, every variant', () => {
    for (const variant of [WHOLE_DAMATH]) {
      const state = createGame(variant);
      const features = encodeNnueFeatures(state, numberToNumber);
      expect(features).toHaveLength(192);
      expect(Array.from(features).every((v) => Number.isFinite(v))).toBe(true);
      // 24 pieces on the board at the start (docs/DAMATH_RULES.md §2.1)
      const existing = Array.from({ length: 32 }, (_, i) => features[i * 6]).filter((v) => v === 1);
      expect(existing).toHaveLength(24);
    }
  });
});
