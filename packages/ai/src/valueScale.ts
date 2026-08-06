import type { Fraction, Polynomial, Radical, VariantId } from '@damath/engine';
import { ALL_VARIANTS } from '@damath/engine';

/**
 * The search/evaluation heuristic (evaluate.ts, ordering.ts) needs to compare and sum
 * chip values numerically to rank moves — that's a natural fit for `number`-valued
 * variants, but Fraction/Radical/Polynomial chip values aren't plain numbers. Rather
 * than teach the search tree to carry `V`-typed running totals (which would need
 * `V`-typed *weights* too, and terms like "legal move count" or "rows from promotion"
 * were never value-shaped to begin with), every variant gets a `toNumber` bridge: a
 * real-valued approximation of a chip value, used *only* inside this AI package's own
 * heuristic scoring. It is never used for the actual win condition, on-board score, or
 * anything a player sees — those stay exact via `Arithmetic<V>.compare`/`finalScores`
 * the same way they always have (`evaluate`'s terminal-position branch still asks the
 * engine for the *exact* final scores, not an approximation of them).
 *
 * Each bridge matches a convention this codebase already committed to for exactly this
 * problem: `Fraction`'s is the obvious `num/den`; `Radical`'s mirrors the private
 * `toNumber` `radical.ts`'s own `compare` already uses internally
 * (`coefficient * sqrt(radicand)`, summed); `Polynomial`'s mirrors `polynomial.ts`'s
 * documented `compare` convention (evaluate at `x = y = 1`, i.e. sum of coefficients)
 * — a decision recorded there as "not a rulebook fact" for the identical reason this
 * bridge exists: general polynomials have no natural total order either.
 */
export type ToNumber<V> = (value: V) => number;

export const numberToNumber: ToNumber<number> = (n) => n;

export const fractionToNumber: ToNumber<Fraction> = (f) => f.num / f.den;

export const radicalToNumber: ToNumber<Radical> = (r) =>
  r.reduce((sum, term) => sum + (term.coefficient.num / term.coefficient.den) * Math.sqrt(term.radicand), 0);

export const polynomialToNumber: ToNumber<Polynomial> = (p) => p.reduce((sum, term) => sum + term.coefficient.num / term.coefficient.den, 0);

type AnyToNumber = ToNumber<number> | ToNumber<Fraction> | ToNumber<Radical> | ToNumber<Polynomial>;

const TO_NUMBER_BY_VARIANT: Readonly<Record<VariantId, AnyToNumber>> = {
  whole: numberToNumber,
  counting: numberToNumber,
  integer: numberToNumber,
  fraction: fractionToNumber,
  rational: fractionToNumber,
  radical: radicalToNumber,
  polynomial: polynomialToNumber,
};

/** Looks up the right bridge for a variant id — the one place that ties `VariantId` to its `ToNumber<V>`, so a caller holding a concrete `V` (via `Variant<V>`) never has to know which chip-value shape it actually is. */
export function toNumberFor<V>(variantId: VariantId): ToNumber<V> {
  const fn = TO_NUMBER_BY_VARIANT[variantId];
  return fn as ToNumber<V>;
}

/** Every variant id this package can resolve a `ToNumber` for — currently all seven, since every `Variant<V>` in `ALL_VARIANTS` has one above. Kept as a runtime list (not just the type) so `variant.ts` can validate against it without duplicating `ALL_VARIANTS`'s id set by hand. */
export const AI_SUPPORTED_VARIANT_IDS: readonly VariantId[] = ALL_VARIANTS.map((v) => v.id);
