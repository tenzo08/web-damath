import { ALL_VARIANTS } from '@damath/engine';
import type { AnyVariant, GameState, Variant } from '@damath/engine';
import { toNumberFor, type ToNumber } from './valueScale.js';

/**
 * The engine itself is generic over the chip value type, but a `GameState<V>` only
 * carries a bare `variant` id string, not the `Variant<V>` object (with its
 * `arithmetic`) that `applyMove`/`finalScores` need, nor the `ToNumber<V>` bridge this
 * package's own heuristic search needs (valueScale.ts). This resolves both, once per
 * search, rather than threading them through every public call site.
 */
export function resolveVariant<V>(variantId: GameState<V>['variant']): { variant: Variant<V>; toNumber: ToNumber<V> } {
  const variant = ALL_VARIANTS.find((v) => v.id === variantId);
  if (!variant) {
    throw new Error(`@damath/ai: unknown variant id "${variantId}"`);
  }
  return { variant: variant as unknown as Variant<V>, toNumber: toNumberFor<V>(variantId) };
}

export type { AnyVariant };
