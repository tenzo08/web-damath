import { describe, expect, it } from 'vitest';
import { fraction } from '../src/data/fraction.js';
import { POLYNOMIAL_DAMATH, polynomial, polynomialArithmetic } from '../src/data/polynomial.js';

describe('polynomial() construction', () => {
  it('a zero coefficient collapses to the empty (zero) polynomial', () => {
    expect(polynomial(fraction(0), 2, 1)).toEqual([]);
  });

  it('keeps a nonzero constant term (exponents 0,0)', () => {
    expect(polynomial(fraction(5))).toEqual([{ xExp: 0, yExp: 0, coefficient: fraction(5) }]);
  });
});

describe('polynomialArithmetic', () => {
  it('adds like terms by combining coefficients', () => {
    const a = polynomial(fraction(3), 2, 1); // 3x²y
    const b = polynomial(fraction(4), 2, 1); // 4x²y
    expect(polynomialArithmetic.add(a, b)).toEqual([{ xExp: 2, yExp: 1, coefficient: fraction(7) }]);
  });

  it('adding unlike terms keeps both (a genuine multi-term sum)', () => {
    const a = polynomial(fraction(6), 1, 0); // 6x
    const b = polynomial(fraction(10), 0, 1); // 10y
    const sum = polynomialArithmetic.add(a, b);
    expect(sum).toHaveLength(2);
    expect(sum).toEqual(expect.arrayContaining([
      { xExp: 1, yExp: 0, coefficient: fraction(6) },
      { xExp: 0, yExp: 1, coefficient: fraction(10) },
    ]));
  });

  it('subtracting to exactly zero drops the term', () => {
    const a = polynomial(fraction(6), 1, 0);
    expect(polynomialArithmetic.sub(a, a)).toEqual([]);
  });

  it('multiplication adds exponents and multiplies coefficients', () => {
    const a = polynomial(fraction(6), 1, 0); // 6x
    const b = polynomial(fraction(2), 1, 1); // 2xy
    expect(polynomialArithmetic.mul(a, b)).toEqual([{ xExp: 2, yExp: 1, coefficient: fraction(12) }]);
  });

  it('multiplying two multi-term polynomials distributes and combines like terms', () => {
    const a = polynomialArithmetic.add(polynomial(fraction(1), 1, 0), polynomial(fraction(1), 0, 1)); // x + y
    const product = polynomialArithmetic.mul(a, a); // (x+y)^2 = x^2 + 2xy + y^2
    expect(product).toEqual(
      expect.arrayContaining([
        { xExp: 2, yExp: 0, coefficient: fraction(1) },
        { xExp: 1, yExp: 1, coefficient: fraction(2) },
        { xExp: 0, yExp: 2, coefficient: fraction(1) },
      ]),
    );
    expect(product).toHaveLength(3);
  });

  it('division subtracts exponents and may produce a negative exponent', () => {
    const a = polynomial(fraction(36), 2, 1); // 36x²y
    const b = polynomial(fraction(6), 1, 0); // 6x
    expect(polynomialArithmetic.div(a, b)).toEqual([{ xExp: 1, yExp: 1, coefficient: fraction(6) }]); // 6xy

    const negative = polynomialArithmetic.div(polynomial(fraction(6), 1, 0), polynomial(fraction(2), 2, 0)); // 6x / 2x^2 = 3x^-1
    expect(negative).toEqual([{ xExp: -1, yExp: 0, coefficient: fraction(3) }]);
  });

  it('dividing by a multi-term polynomial is explicitly unsupported (never occurs in real play)', () => {
    const multiTerm = polynomialArithmetic.add(polynomial(fraction(1), 1, 0), polynomial(fraction(1), 0, 1));
    expect(() => polynomialArithmetic.div(polynomial(fraction(1), 1, 0), multiTerm)).toThrow();
  });

  it('negate, isZero, equals, double', () => {
    const a = polynomial(fraction(3), 2, 1);
    expect(polynomialArithmetic.negate(a)).toEqual([{ xExp: 2, yExp: 1, coefficient: fraction(-3) }]);
    expect(polynomialArithmetic.isZero(polynomialArithmetic.zero)).toBe(true);
    expect(polynomialArithmetic.equals(a, polynomial(fraction(3), 2, 1))).toBe(true);
    expect(polynomialArithmetic.equals(a, polynomial(fraction(4), 2, 1))).toBe(false);
    expect(polynomialArithmetic.double(a)).toEqual([{ xExp: 2, yExp: 1, coefficient: fraction(6) }]);
  });

  it('compare evaluates at x=y=1 (documented interpretation — general polynomials have no natural order)', () => {
    const a = polynomial(fraction(2), 1, 0); // evaluates to 2
    const b = polynomialArithmetic.add(polynomial(fraction(1), 1, 0), polynomial(fraction(4), 0, 1)); // x + 4y -> 5
    expect(polynomialArithmetic.compare(a, b)).toBeLessThan(0);
    expect(polynomialArithmetic.compare(b, a)).toBeGreaterThan(0);
  });

  it('formats terms with superscript exponents, omitting unit coefficients and exponent 1', () => {
    expect(polynomialArithmetic.format(polynomial(fraction(36), 2, 1))).toBe('36x²y');
    expect(polynomialArithmetic.format(polynomial(fraction(-21), 1, 2))).toBe('-21xy²');
    expect(polynomialArithmetic.format(polynomial(fraction(6), 1, 0))).toBe('6x');
    expect(polynomialArithmetic.format(polynomial(fraction(1), 1, 0))).toBe('x');
    expect(polynomialArithmetic.format(polynomial(fraction(-1), 0, 1))).toBe('-y');
    expect(polynomialArithmetic.format(polynomialArithmetic.zero)).toBe('0');
  });
});

describe('substituteAt (coordinate-substitution scoring house rule)', () => {
  it('evaluates a single term at the given (x, y) into a whole-number constant', () => {
    // 36x²y at x=2, y=1 -> 36 * 2² * 1 = 144
    const term = polynomial(fraction(36), 2, 1);
    expect(polynomialArithmetic.substituteAt?.(term, 2, 1)).toEqual([{ xExp: 0, yExp: 0, coefficient: fraction(144) }]);
  });

  it('distributes over a multi-term sum, matching term-by-term substitution', () => {
    // 6x + 10y at x=4, y=1 -> 6*4 + 10*1 = 34
    const sum = polynomialArithmetic.add(polynomial(fraction(6), 1, 0), polynomial(fraction(10), 0, 1));
    expect(polynomialArithmetic.substituteAt?.(sum, 4, 1)).toEqual([{ xExp: 0, yExp: 0, coefficient: fraction(34) }]);
  });

  it('a term with exponent 0 in one variable ignores that coordinate', () => {
    // 6x at any y -> unaffected by y
    const term = polynomial(fraction(6), 1, 0);
    expect(polynomialArithmetic.substituteAt?.(term, 5, 99)).toEqual([{ xExp: 0, yExp: 0, coefficient: fraction(30) }]);
  });

  it('evaluating to zero collapses to the empty polynomial, like any other zero value', () => {
    const term = polynomial(fraction(6), 1, 0);
    expect(polynomialArithmetic.substituteAt?.(term, 0, 5)).toEqual([]);
  });
});

describe('POLYNOMIAL_DAMATH variant data', () => {
  it('matches the printed chip values exactly', () => {
    expect(POLYNOMIAL_DAMATH.values.map((v) => polynomialArithmetic.format(v))).toEqual([
      '-3x²y',
      '-xy²',
      '6x',
      '10y',
      '-21xy²',
      '-15x',
      '28y',
      '36x²y',
      '-55x',
      '-45y',
      '66x²y',
      '78xy²',
    ]);
  });
});
