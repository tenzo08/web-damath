import { ALL_VARIANTS } from '@damath/engine';
import type { AnyVariant, VariantId } from '@damath/engine';

export function findVariant(variantId: VariantId): AnyVariant | null {
  return ALL_VARIANTS.find((v) => v.id === variantId) ?? null;
}
