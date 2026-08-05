/**
 * Polynomial Damath (Fourth Year) — docs/VARIANTS.md, the hardest variant, built
 * last. A value is a sum of terms in two variables, each `coefficient * x^i * y^j`.
 * Addition combines like terms; multiplication adds exponents; division subtracts
 * them and may produce negative exponents (§ "may produce negative exponents" —
 * this engine represents that directly rather than rejecting it, since nothing in
 * the rules says a negative-exponent result is illegal, only unusual).
 *
 * `compare` (needed for §8.3's "greater total wins") is a genuinely open question:
 * general polynomials have no natural total order. **Decision, not a rulebook
 * fact:** compare by evaluating both at `x = y = 1` (the sum of coefficients) — a
 * simple, deterministic, and defensible proxy, recorded here per the project's
 * standing rule for open questions (KNOWLEDGE.md-style: documented interpretation,
 * not a guess passed off as settled).
 */

import type { Arithmetic, Variant } from '../arithmetic.js';
import { fractionArithmetic, formatFraction, reduceFraction, type Fraction } from './fraction.js';

export interface PolynomialTerm {
  readonly xExp: number;
  readonly yExp: number;
  readonly coefficient: Fraction;
}

/** Sorted by total degree descending, then xExp descending; no duplicate exponent pairs; no zero coefficients. Empty = 0. */
export type Polynomial = readonly PolynomialTerm[];

function termKey(xExp: number, yExp: number): string {
  return `${String(xExp)},${String(yExp)}`;
}

function mergeTerms(terms: readonly PolynomialTerm[]): Polynomial {
  const byExponents = new Map<string, PolynomialTerm>();
  for (const term of terms) {
    const key = termKey(term.xExp, term.yExp);
    const existing = byExponents.get(key);
    const coefficient = existing ? fractionArithmetic.add(existing.coefficient, term.coefficient) : term.coefficient;
    byExponents.set(key, { xExp: term.xExp, yExp: term.yExp, coefficient });
  }
  return [...byExponents.values()]
    .filter((t) => !fractionArithmetic.isZero(t.coefficient))
    .sort((a, b) => b.xExp + b.yExp - (a.xExp + a.yExp) || b.xExp - a.xExp);
}

export function polynomial(coefficient: Fraction, xExp = 0, yExp = 0): Polynomial {
  return mergeTerms([{ xExp, yExp, coefficient }]);
}

function multiplyTerm(a: PolynomialTerm, b: PolynomialTerm): PolynomialTerm {
  return { xExp: a.xExp + b.xExp, yExp: a.yExp + b.yExp, coefficient: fractionArithmetic.mul(a.coefficient, b.coefficient) };
}

function evaluateAtOne(p: Polynomial): Fraction {
  return p.reduce((sum, term) => fractionArithmetic.add(sum, term.coefficient), fractionArithmetic.zero);
}

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
};

function superscript(n: number): string {
  return String(n)
    .split('')
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch)
    .join('');
}

function formatVariable(name: string, exp: number): string {
  if (exp === 0) return '';
  if (exp === 1) return name;
  return `${name}${superscript(exp)}`;
}

function formatTerm(term: PolynomialTerm): string {
  const variables = formatVariable('x', term.xExp) + formatVariable('y', term.yExp);
  if (!variables) return formatFraction(term.coefficient);
  if (term.coefficient.den === 1) {
    if (term.coefficient.num === 1) return variables;
    if (term.coefficient.num === -1) return `-${variables}`;
    return `${String(term.coefficient.num)}${variables}`;
  }
  return `${formatFraction(term.coefficient)}${variables}`;
}

export const polynomialArithmetic: Arithmetic<Polynomial> = {
  add: (a, b) => mergeTerms([...a, ...b]),
  sub: (a, b) => mergeTerms([...a, ...b.map((t) => ({ ...t, coefficient: fractionArithmetic.negate(t.coefficient) }))]),
  mul: (a, b) => mergeTerms(a.flatMap((ta) => b.map((tb) => multiplyTerm(ta, tb)))),
  div: (a, b) => {
    if (b.length === 0) return []; // guarded upstream (scoring.ts) — never reached in practice
    if (b.length > 1) {
      throw new Error(
        'Polynomial division by a multi-term value is not supported — every on-board piece value is always a single term, which is the only divisor this engine ever produces.',
      );
    }
    const divisor = b[0];
    if (!divisor) throw new Error('unreachable: b.length === 1');
    return mergeTerms(
      a.map((t) => ({
        xExp: t.xExp - divisor.xExp,
        yExp: t.yExp - divisor.yExp,
        coefficient: fractionArithmetic.div(t.coefficient, divisor.coefficient),
      })),
    );
  },
  negate: (a) => a.map((t) => ({ ...t, coefficient: fractionArithmetic.negate(t.coefficient) })),
  isZero: (a) => a.length === 0,
  equals: (a, b) =>
    a.length === b.length &&
    a.every((t, i) => b[i]?.xExp === t.xExp && b[i]?.yExp === t.yExp && fractionArithmetic.equals(t.coefficient, b[i]?.coefficient ?? fractionArithmetic.zero)),
  compare: (a, b) => fractionArithmetic.compare(evaluateAtOne(a), evaluateAtOne(b)),
  double: (a) => mergeTerms([...a, ...a]),
  format: (a) => {
    if (a.length === 0) return '0';
    return a
      .map((term, i) => {
        const body = formatTerm(term);
        if (i === 0) return body;
        return term.coefficient.num < 0 ? ` - ${body.replace(/^-/, '')}` : ` + ${body}`;
      })
      .join('');
  },
  zero: [],
  finalizeScore: (a) => a,
};

/** docs/VARIANTS.md's printed values: [coefficient, xExp, yExp]. */
const POLYNOMIAL_VALUES: readonly [number, number, number][] = [
  [-3, 2, 1],
  [-1, 1, 2],
  [6, 1, 0],
  [10, 0, 1],
  [-21, 1, 2],
  [-15, 1, 0],
  [28, 0, 1],
  [36, 2, 1],
  [-55, 1, 0],
  [-45, 0, 1],
  [66, 2, 1],
  [78, 1, 2],
];

export const POLYNOMIAL_DAMATH: Variant<Polynomial> = {
  id: 'polynomial',
  name: 'Polynomial Damath',
  gradeLevel: 'Fourth Year',
  values: POLYNOMIAL_VALUES.map(([coefficient, xExp, yExp]) => polynomial(reduceFraction(coefficient, 1), xExp, yExp)),
  arithmetic: polynomialArithmetic,
};
