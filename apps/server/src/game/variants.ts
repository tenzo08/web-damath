import { ALL_VARIANTS, COUNTING_DAMATH, INTEGER_DAMATH, WHOLE_DAMATH } from '@damath/engine';
import type { AnyVariant, Variant, VariantId } from '@damath/engine';

export function findVariant(variantId: VariantId): AnyVariant | null {
  return ALL_VARIANTS.find((v) => v.id === variantId) ?? null;
}

/** docs/AI_OPPONENT.md §4 — the only three variants with a numeric chip value, hence the only three the AI (and queue-fallback) can play. */
const INTEGER_VARIANTS_BY_ID: Readonly<Partial<Record<VariantId, Variant<number>>>> = {
  whole: WHOLE_DAMATH,
  counting: COUNTING_DAMATH,
  integer: INTEGER_DAMATH,
};

export function findIntegerVariant(variantId: VariantId): Variant<number> | null {
  return INTEGER_VARIANTS_BY_ID[variantId] ?? null;
}
