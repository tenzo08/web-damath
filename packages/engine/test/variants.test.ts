import { describe, expect, it } from 'vitest';
import {
  COUNTING_DAMATH,
  INTEGER_DAMATH,
  INTEGER_VARIANTS,
  WHOLE_DAMATH,
} from '../src/data/variants.js';

describe('integer variants', () => {
  it('each has exactly 12 values', () => {
    for (const variant of INTEGER_VARIANTS) {
      expect(variant.values).toHaveLength(12);
    }
  });

  it('Whole Damath is 0-11, each value once', () => {
    expect([...WHOLE_DAMATH.values].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('Counting Damath is 1-12, each value once', () => {
    expect([...COUNTING_DAMATH.values].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('Integer Damath is signed, matching the rulebook exactly', () => {
    expect(INTEGER_DAMATH.values).toEqual([-9, 6, -1, 4, 0, -3, 10, -7, -11, 8, -5, 2]);
  });
});
