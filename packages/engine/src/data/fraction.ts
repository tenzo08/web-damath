/**
 * Fraction Damath (Grades 5-6) and Rational Damath (Grade 8) — docs/VARIANTS.md.
 * "Exact fraction arithmetic required": unlike the integer variants, division here
 * never truncates (`Arithmetic<Fraction>.finalizeScore` is the identity).
 */

import type { Arithmetic, Variant } from '../arithmetic.js';

export interface Fraction {
  readonly num: number;
  /** Always a positive integer — the sign lives entirely in `num`. */
  readonly den: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x === 0 ? 1 : x;
}

/** Reduces to lowest terms with a positive denominator; never returns `den: 0` (callers must not construct one). */
export function reduceFraction(num: number, den: number): Fraction {
  if (den === 0) {
    throw new Error('Fraction denominator must not be zero');
  }
  const sign = den < 0 ? -1 : 1;
  const n = num * sign;
  const d = den * sign;
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

export function fraction(num: number, den = 1): Fraction {
  return reduceFraction(num, den);
}

export function formatFraction(f: Fraction): string {
  if (f.den === 1) return String(f.num);
  return `${String(f.num)}/${String(f.den)}`;
}

export const fractionArithmetic: Arithmetic<Fraction> = {
  add: (a, b) => reduceFraction(a.num * b.den + b.num * a.den, a.den * b.den),
  sub: (a, b) => reduceFraction(a.num * b.den - b.num * a.den, a.den * b.den),
  mul: (a, b) => reduceFraction(a.num * b.num, a.den * b.den),
  div: (a, b) => reduceFraction(a.num * b.den, a.den * b.num),
  negate: (a) => ({ num: -a.num, den: a.den }),
  isZero: (a) => a.num === 0,
  equals: (a, b) => a.num === b.num && a.den === b.den,
  compare: (a, b) => a.num * b.den - b.num * a.den,
  double: (a) => reduceFraction(a.num * 2, a.den),
  format: formatFraction,
  zero: { num: 0, den: 1 },
  finalizeScore: (a) => a,
};

export const FRACTION_DAMATH: Variant<Fraction> = {
  id: 'fraction',
  name: 'Fraction Damath',
  gradeLevel: 'Grades 5–6',
  values: [10, 7, 2, 5, 1, 4, 11, 8, 12, 9, 6, 3].map((n) => fraction(n, 10)),
  arithmetic: fractionArithmetic,
};

export const RATIONAL_DAMATH: Variant<Fraction> = {
  id: 'rational',
  name: 'Rational Damath',
  gradeLevel: 'Grade 8',
  values: [-9, 6, -1, 4, 0, -3, 10, -7, -11, 8, -5, 2].map((n) => fraction(n, 10)),
  arithmetic: fractionArithmetic,
};
