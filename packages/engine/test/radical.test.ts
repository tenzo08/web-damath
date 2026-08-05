import { describe, expect, it } from 'vitest';
import { fraction } from '../src/data/fraction.js';
import { RADICAL_DAMATH, radical, radicalArithmetic } from '../src/data/radical.js';

describe('radical() normalization', () => {
  it('extracts a perfect-square factor: sqrt(8) -> 2*sqrt(2)', () => {
    expect(radical(fraction(1), 8)).toEqual([{ radicand: 2, coefficient: fraction(2) }]);
  });

  it('extracts the largest perfect-square factor across multiple prime-squared factors', () => {
    // 144 = 16 * 9, both perfect squares -> sqrt(144) = 12
    expect(radical(fraction(1), 144)).toEqual([{ radicand: 1, coefficient: fraction(12) }]);
  });

  it('a radicand that is already square-free stays as-is', () => {
    expect(radical(fraction(3), 2)).toEqual([{ radicand: 2, coefficient: fraction(3) }]);
  });

  it('a zero coefficient or zero radicand collapses to the empty (zero) radical', () => {
    expect(radical(fraction(0), 8)).toEqual([]);
    expect(radical(fraction(5), 0)).toEqual([]);
  });
});

describe('radicalArithmetic', () => {
  it('adds like radicands by combining coefficients', () => {
    const a = radical(fraction(2), 2); // 2√2
    const b = radical(fraction(3), 2); // 3√2
    expect(radicalArithmetic.add(a, b)).toEqual([{ radicand: 2, coefficient: fraction(5) }]);
  });

  it('adding unlike radicands keeps both terms (a genuine multi-term sum)', () => {
    const a = radical(fraction(1), 2); // √2
    const b = radical(fraction(1), 3); // √3
    expect(radicalArithmetic.add(a, b)).toEqual([
      { radicand: 2, coefficient: fraction(1) },
      { radicand: 3, coefficient: fraction(1) },
    ]);
  });

  it('subtracting to exactly zero drops the term entirely', () => {
    const a = radical(fraction(2), 2);
    expect(radicalArithmetic.sub(a, a)).toEqual([]);
  });

  it('multiplying two multiples of the same radicand produces a rational result: sqrt(2) * sqrt(2) = 2', () => {
    const a = radical(fraction(1), 2);
    expect(radicalArithmetic.mul(a, a)).toEqual([{ radicand: 1, coefficient: fraction(2) }]);
  });

  it('multiplying different radicands renormalizes: sqrt(2) * sqrt(8) = sqrt(16) = 4', () => {
    const a = radical(fraction(1), 2);
    const b = radical(fraction(1), 8);
    expect(radicalArithmetic.mul(a, b)).toEqual([{ radicand: 1, coefficient: fraction(4) }]);
  });

  it('dividing by a single-term radical rationalizes the denominator', () => {
    // (4*sqrt(2)) / (2*sqrt(2)) = 4/2 = 2 (rational — both terms cancel to radicand 1)
    const a = radical(fraction(4), 2);
    const b = radical(fraction(2), 2);
    expect(radicalArithmetic.div(a, b)).toEqual([{ radicand: 1, coefficient: fraction(2) }]);
  });

  it('dividing by a multi-term radical is explicitly unsupported (never occurs in real play)', () => {
    const multiTerm = radicalArithmetic.add(radical(fraction(1), 2), radical(fraction(1), 3));
    expect(() => radicalArithmetic.div(radical(fraction(1), 2), multiTerm)).toThrow();
  });

  it('double is the same as adding to itself', () => {
    const a = radical(fraction(3), 2);
    expect(radicalArithmetic.double(a)).toEqual(radicalArithmetic.add(a, a));
  });

  it('compare orders by approximate real value', () => {
    const small = radical(fraction(1), 2); // sqrt(2) ~= 1.41
    const large = radical(fraction(2), 2); // 2*sqrt(2) ~= 2.83
    expect(radicalArithmetic.compare(small, large)).toBeLessThan(0);
    expect(radicalArithmetic.compare(large, small)).toBeGreaterThan(0);
    expect(radicalArithmetic.compare(small, small)).toBe(0);
  });

  it('isZero and equals', () => {
    expect(radicalArithmetic.isZero(radicalArithmetic.zero)).toBe(true);
    expect(radicalArithmetic.equals(radical(fraction(2), 2), radical(fraction(2), 2))).toBe(true);
    expect(radicalArithmetic.equals(radical(fraction(2), 2), radical(fraction(3), 2))).toBe(false);
  });

  it('formats single and multi-term values, including the all-rational (radicand 1) and unit-coefficient cases', () => {
    expect(radicalArithmetic.format(radical(fraction(3), 2))).toBe('3√2');
    expect(radicalArithmetic.format(radical(fraction(1), 2))).toBe('√2');
    expect(radicalArithmetic.format(radical(fraction(-1), 2))).toBe('-√2');
    expect(radicalArithmetic.format(radical(fraction(1), 1))).toBe('1');
    expect(radicalArithmetic.format(radicalArithmetic.zero)).toBe('0');
    const mixed = radicalArithmetic.add(radical(fraction(2), 2), radical(fraction(-3), 3));
    expect(radicalArithmetic.format(mixed)).toBe('2√2 - 3√3');
  });
});

describe('RADICAL_DAMATH variant data', () => {
  it('every printed value normalizes to a multiple of √2, per docs/VARIANTS.md\'s closure claim', () => {
    for (const value of RADICAL_DAMATH.values) {
      expect(value.every((term) => term.radicand === 2 || term.radicand === 1)).toBe(true);
    }
  });

  it('spot-checks the normalized forms against the printed chip values', () => {
    // -9√2 stays -9√2 (already square-free)
    expect(RADICAL_DAMATH.arithmetic.format(RADICAL_DAMATH.values[0]!)).toBe('-9√2');
    // -1√8 = -1 * 2√2 = -2√2
    expect(RADICAL_DAMATH.arithmetic.format(RADICAL_DAMATH.values[1]!)).toBe('-2√2');
    // 16√32 = 16 * 4√2 = 64√2
    expect(RADICAL_DAMATH.arithmetic.format(RADICAL_DAMATH.values[3]!)).toBe('64√2');
    // 64√2 stays 64√2
    expect(RADICAL_DAMATH.arithmetic.format(RADICAL_DAMATH.values[7]!)).toBe('64√2');
  });
});
