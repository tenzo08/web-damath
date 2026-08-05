import { INTEGER_VARIANTS } from '@damath/engine';
import type { GameState, Variant } from '@damath/engine';

/**
 * `packages/ai` plays the three integer variants only (docs/AI_OPPONENT.md §4) — the
 * engine itself is generic over the chip value type, but a `GameState<number>` only
 * carries a bare `variant` id string, not the `Variant<number>` object (with its
 * `arithmetic`) that `applyMove`/`finalScores` need. This resolves that id back to
 * the concrete variant, once per search, rather than threading the whole `Variant`
 * object through every public call site.
 */
export function resolveVariant(variantId: GameState<number>['variant']): Variant<number> {
  const variant = INTEGER_VARIANTS.find((v) => v.id === variantId);
  if (!variant) {
    throw new Error(`@damath/ai only plays integer variants (whole/counting/integer) — got "${variantId}"`);
  }
  return variant;
}
