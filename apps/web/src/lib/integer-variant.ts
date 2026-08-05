import type { AnyVariant, IntegerVariantId, Variant } from '@damath/engine';

const INTEGER_VARIANT_IDS: ReadonlySet<IntegerVariantId> = new Set(['whole', 'counting', 'integer']);

function isIntegerVariantId(id: AnyVariant['id']): id is IntegerVariantId {
  return INTEGER_VARIANT_IDS.has(id as IntegerVariantId);
}

/**
 * Narrows `AnyVariant` to `Variant<number>` when it actually is one. `Variant<V>.id`
 * is typed as the broad `VariantId`, not a per-V literal, so TypeScript can't derive
 * this from the union alone — it's a real invariant (each variant module only ever
 * constructs `Variant<number>` for these three ids), just not one the type system
 * tracks automatically. The AI (docs/AI_OPPONENT.md §4) and practice mode only work
 * for these three; every other caller should treat `null` as "not supported here."
 */
export function asIntegerVariant(variant: AnyVariant): Variant<number> | null {
  return isIntegerVariantId(variant.id) ? (variant as Variant<number>) : null;
}
