import type { VariantId } from './types.js';

/**
 * The operations the engine needs to perform on a chip value, independent of what
 * that value actually is (docs/adr/0002). `packages/engine` never inspects `V`
 * directly — every arithmetic-shaped thing it does (scoring, doubling for Dama,
 * comparing final totals) goes through one of these.
 */
export interface Arithmetic<V> {
  add(a: V, b: V): V;
  sub(a: V, b: V): V;
  mul(a: V, b: V): V;
  div(a: V, b: V): V;
  negate(a: V): V;
  isZero(a: V): boolean;
  equals(a: V, b: V): boolean;
  /** Negative if a < b, positive if a > b, zero if equal — for final-score comparison (§8.3). */
  compare(a: V, b: V): number;
  /** The Dama multiplier (§5.3) is applied by doubling, twice for Dama-takes-Dama. */
  double(a: V): V;
  /** Display form: "2√2", "-3/10", "36x²y". Must align sensibly in the move ledger's monospace columns. */
  format(a: V): string;
  readonly zero: V;
  /**
   * Applied once to a capture's fully-computed score (after the operation and the
   * Dama multiplier). Real second requirement, discovered implementing this: the
   * existing integer rule ("a magnitude under 1 counts as 0, otherwise truncate
   * toward zero" — KNOWLEDGE.md, "Division truncation") is scoped to the *finished*
   * score, not to `div` alone — `(3+5)` needs no truncation, but `dama.double(3/10)`
   * does, and truncating inside `div` before doubling would zero out results that
   * shouldn't be (e.g. raw 0.6, magnitude < 1, but doubled to 1.2). Identity for
   * every exact (Fraction/Radical/Polynomial) type — nothing in docs/VARIANTS.md
   * asks for magnitude-zeroing outside the integer variants, and "exact fraction
   * arithmetic required" says the opposite.
   */
  finalizeScore(a: V): V;
}

export interface Variant<V> {
  readonly id: VariantId;
  readonly name: string;
  readonly gradeLevel: string;
  /** 12 chip values in rulebook print order (line 1, then 2, then 3, left to right). */
  readonly values: readonly V[];
  readonly arithmetic: Arithmetic<V>;
}

/**
 * `number`-backed arithmetic for Whole, Counting, and Integer Damath — all three use
 * plain (possibly signed) integers. Division truncates toward zero and a
 * sub-magnitude-1 result counts as 0 (KNOWLEDGE.md, "Division truncation" — decided
 * for these three variants specifically, confirmed against `reference/`).
 */
export const numberArithmetic: Arithmetic<number> = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  // Division by zero contributes 0 (§5.5) is handled generically in scoring.ts,
  // not here — it applies to every variant, not just this one.
  div: (a, b) => a / b,
  negate: (a) => -a,
  isZero: (a) => a === 0,
  equals: (a, b) => a === b,
  compare: (a, b) => a - b,
  double: (a) => a * 2,
  format: (a) => String(a),
  zero: 0,
  finalizeScore: (a) => (Math.abs(a) < 1 ? 0 : Math.trunc(a)),
};
