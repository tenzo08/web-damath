/**
 * Radical Damath (Grade 9) — docs/VARIANTS.md. A value is a sum of terms, each
 * `coefficient * sqrt(radicand)`, radicand always a square-free positive integer
 * (`radicand: 1` is a plain rational term — `sqrt(1) = 1`). Addition/subtraction
 * combine like radicands; multiplication and division can produce a *different*
 * radicand, which is why every operation renormalizes its result rather than
 * assuming the variant's documented closure ("every value reduces to a multiple of
 * √2") holds by construction alone — two multiples of √2 multiplied together
 * produce a rational (√2 × √2 = 2), so the representation has to support more than
 * one distinct radicand to stay closed under the actual arithmetic.
 *
 * A plain array, not a `Map` — `GameState` is JSON-serialized as-is (`board.ts`),
 * and `Map` doesn't survive `JSON.stringify` (docs/adr/0002 calls this out as a
 * cost of the generic design; this sidesteps it rather than writing a codec).
 */

import type { Arithmetic, Variant } from '../arithmetic.js';
import { fraction, fractionArithmetic, formatFraction, reduceFraction, type Fraction } from './fraction.js';

export interface RadicalTerm {
  readonly radicand: number;
  readonly coefficient: Fraction;
}

/** Sorted ascending by radicand, no duplicate radicands, no zero-coefficient terms. Empty = 0. */
export type Radical = readonly RadicalTerm[];

function extractSquareFactor(n: number): { readonly factor: number; readonly remainder: number } {
  let remainder = n;
  let factor = 1;
  for (let i = 2; i * i <= remainder; i++) {
    while (remainder % (i * i) === 0) {
      remainder /= i * i;
      factor *= i;
    }
  }
  return { factor, remainder };
}

function mergeTerms(terms: readonly RadicalTerm[]): Radical {
  const byRadicand = new Map<number, Fraction>();
  for (const term of terms) {
    const existing = byRadicand.get(term.radicand) ?? fractionArithmetic.zero;
    byRadicand.set(term.radicand, fractionArithmetic.add(existing, term.coefficient));
  }
  return [...byRadicand.entries()]
    .filter(([, coefficient]) => !fractionArithmetic.isZero(coefficient))
    .sort(([a], [b]) => a - b)
    .map(([radicand, coefficient]) => ({ radicand, coefficient }));
}

/** Builds a single-term radical, extracting any perfect-square factor (`sqrt(8) -> 2*sqrt(2)`). */
export function radical(coefficient: Fraction, radicand: number): Radical {
  if (radicand < 0) throw new Error(`radicand must be non-negative, got ${String(radicand)}`);
  if (radicand === 0 || fractionArithmetic.isZero(coefficient)) return [];
  const { factor, remainder } = extractSquareFactor(radicand);
  return mergeTerms([{ radicand: remainder, coefficient: fractionArithmetic.mul(coefficient, fraction(factor)) }]);
}

function multiplyTerm(a: RadicalTerm, b: RadicalTerm): Radical {
  return radical(fractionArithmetic.mul(a.coefficient, b.coefficient), a.radicand * b.radicand);
}

/** Approximates the real value (`coefficient * sqrt(radicand)`, summed) — only used for `compare`, never for exact arithmetic. */
function toNumber(a: Radical): number {
  return a.reduce((sum, term) => sum + (term.coefficient.num / term.coefficient.den) * Math.sqrt(term.radicand), 0);
}

export const radicalArithmetic: Arithmetic<Radical> = {
  add: (a, b) => mergeTerms([...a, ...b]),
  sub: (a, b) => mergeTerms([...a, ...b.map((t) => ({ radicand: t.radicand, coefficient: fractionArithmetic.negate(t.coefficient) }))]),
  mul: (a, b) => mergeTerms(a.flatMap((ta) => b.flatMap((tb) => multiplyTerm(ta, tb)))),
  div: (a, b) => {
    if (b.length === 0) return []; // guarded upstream (scoring.ts) — division by zero never reaches here in practice
    if (b.length > 1) {
      throw new Error(
        'Radical division by a multi-term value is not supported — every on-board piece value is always a single term, which is the only divisor this engine ever produces.',
      );
    }
    const divisor = b[0];
    if (!divisor) throw new Error('unreachable: b.length === 1');
    // Rationalizing: (c1*sqrt(r1)) / (c2*sqrt(r2)) = (c1 / (c2*r2)) * sqrt(r1*r2).
    const terms = a.flatMap((t) => {
      const denominator = fractionArithmetic.mul(divisor.coefficient, fraction(divisor.radicand));
      return radical(fractionArithmetic.div(t.coefficient, denominator), t.radicand * divisor.radicand);
    });
    return mergeTerms(terms);
  },
  negate: (a) => a.map((t) => ({ radicand: t.radicand, coefficient: fractionArithmetic.negate(t.coefficient) })),
  isZero: (a) => a.length === 0,
  equals: (a, b) =>
    a.length === b.length && a.every((t, i) => b[i]?.radicand === t.radicand && fractionArithmetic.equals(t.coefficient, b[i]?.coefficient ?? fractionArithmetic.zero)),
  compare: (a, b) => toNumber(a) - toNumber(b),
  double: (a) => mergeTerms([...a, ...a]),
  format: (a) => {
    if (a.length === 0) return '0';
    return a
      .map((term, i) => {
        const body = term.radicand === 1 ? formatFraction(term.coefficient) : formatRadicalTerm(term);
        if (i === 0) return body;
        return term.coefficient.num < 0 ? ` - ${body.replace(/^-/, '')}` : ` + ${body}`;
      })
      .join('');
  },
  zero: [],
  finalizeScore: (a) => a,
};

function formatRadicalTerm(term: RadicalTerm): string {
  const root = `√${String(term.radicand)}`;
  if (term.coefficient.den === 1) {
    if (term.coefficient.num === 1) return root;
    if (term.coefficient.num === -1) return `-${root}`;
    return `${String(term.coefficient.num)}${root}`;
  }
  return `${formatFraction(term.coefficient)}${root}`;
}

/** docs/VARIANTS.md's printed values, normalized on construction (see module doc — this engine always displays the canonical simplified form). */
const RADICAL_VALUES: readonly [number, number][] = [
  [-9, 2],
  [-1, 8],
  [4, 18],
  [16, 32],
  [-49, 8],
  [-25, 18],
  [36, 32],
  [64, 2],
  [-121, 18],
  [-81, 32],
  [100, 2],
  [144, 8],
];

export const RADICAL_DAMATH: Variant<Radical> = {
  id: 'radical',
  name: 'Radical Damath',
  gradeLevel: 'Grade 9',
  values: RADICAL_VALUES.map(([coefficient, radicand]) => radical(reduceFraction(coefficient, 1), radicand)),
  arithmetic: radicalArithmetic,
};
