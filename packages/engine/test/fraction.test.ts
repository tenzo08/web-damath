import { describe, expect, it } from 'vitest';
import { FRACTION_DAMATH, RATIONAL_DAMATH, fraction, fractionArithmetic, formatFraction, reduceFraction } from '../src/data/fraction.js';

describe('reduceFraction / fraction', () => {
  it('reduces to lowest terms', () => {
    expect(fraction(4, 8)).toEqual({ num: 1, den: 2 });
    expect(fraction(6, 3)).toEqual({ num: 2, den: 1 });
  });

  it('normalizes a negative denominator onto the numerator', () => {
    expect(fraction(3, -4)).toEqual({ num: -3, den: 4 });
    expect(fraction(-3, -4)).toEqual({ num: 3, den: 4 });
  });

  it('throws on a zero denominator rather than silently producing Infinity/NaN', () => {
    expect(() => reduceFraction(1, 0)).toThrow();
  });
});

describe('fractionArithmetic', () => {
  it('adds and subtracts with a common denominator, reduced', () => {
    expect(fractionArithmetic.add(fraction(1, 2), fraction(1, 3))).toEqual({ num: 5, den: 6 });
    expect(fractionArithmetic.sub(fraction(1, 2), fraction(1, 3))).toEqual({ num: 1, den: 6 });
  });

  it('multiplies and divides exactly — no truncation, unlike the integer variants', () => {
    expect(fractionArithmetic.mul(fraction(2, 3), fraction(3, 4))).toEqual({ num: 1, den: 2 });
    expect(fractionArithmetic.div(fraction(1, 2), fraction(1, 3))).toEqual({ num: 3, den: 2 });
    // A result with magnitude under 1 is NOT zeroed for this variant (contrast with numberArithmetic).
    expect(fractionArithmetic.finalizeScore(fraction(1, 4))).toEqual(fraction(1, 4));
  });

  it('negate, isZero, equals, compare, double', () => {
    expect(fractionArithmetic.negate(fraction(3, 4))).toEqual({ num: -3, den: 4 });
    expect(fractionArithmetic.isZero(fraction(0, 5))).toBe(true);
    expect(fractionArithmetic.isZero(fraction(1, 5))).toBe(false);
    expect(fractionArithmetic.equals(fraction(2, 4), fraction(1, 2))).toBe(true);
    expect(fractionArithmetic.compare(fraction(1, 2), fraction(1, 3))).toBeGreaterThan(0);
    expect(fractionArithmetic.compare(fraction(1, 3), fraction(1, 2))).toBeLessThan(0);
    expect(fractionArithmetic.double(fraction(3, 10))).toEqual({ num: 3, den: 5 });
  });

  it('formats a whole number without a denominator', () => {
    expect(formatFraction(fraction(6, 3))).toBe('2');
    expect(formatFraction(fraction(-7, 10))).toBe('-7/10');
  });
});

describe('FRACTION_DAMATH and RATIONAL_DAMATH variant data', () => {
  it('Fraction Damath is Counting Damath\'s values over a denominator of 10', () => {
    expect(FRACTION_DAMATH.values.map(formatFraction)).toEqual([
      '1',
      '7/10',
      '1/5',
      '1/2',
      '1/10',
      '2/5',
      '11/10',
      '4/5',
      '6/5',
      '9/10',
      '3/5',
      '3/10',
    ]);
  });

  it('Rational Damath is Integer Damath\'s signed values over a denominator of 10', () => {
    expect(RATIONAL_DAMATH.values.map(formatFraction)).toEqual([
      '-9/10',
      '3/5',
      '-1/10',
      '2/5',
      '0',
      '-3/10',
      '1',
      '-7/10',
      '-11/10',
      '4/5',
      '-1/2',
      '1/5',
    ]);
  });
});
