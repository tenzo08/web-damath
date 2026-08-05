import type { Arithmetic } from './arithmetic.js';
import type { Operation, Piece } from './types.js';

function rawResult<V>(operation: Operation, takerValue: V, takenValue: V, arithmetic: Arithmetic<V>): V {
  switch (operation) {
    case '+':
      return arithmetic.add(takerValue, takenValue);
    case '-':
      return arithmetic.sub(takerValue, takenValue);
    case '*':
      return arithmetic.mul(takerValue, takenValue);
    case '/':
      // Division by zero contributes 0 (§5.5) — neither reference nor the rulebook
      // treats this as an error, and this applies to every variant equally.
      return arithmetic.isZero(takenValue) ? arithmetic.zero : arithmetic.div(takerValue, takenValue);
  }
}

/**
 * Score for one capture: `takerValue OP takenValue` using the operation on the
 * square the taker lands on (§5.1), doubled per Dama in the capture (§5.3: x1
 * ordinary/ordinary, x2 either side is Dama, x4 both), then finalized — for
 * integer variants that's "magnitude under 1 counts as 0, otherwise truncate
 * toward zero" (KNOWLEDGE.md, "Division truncation"); exact for every other
 * variant. See `Arithmetic<V>.finalizeScore` for why this has to happen after
 * the multiplier, not inside `div`.
 */
export function scoreCapture<V>(
  taker: Piece<V>,
  taken: Piece<V>,
  landingOperation: Operation,
  arithmetic: Arithmetic<V>,
): V {
  const raw = rawResult(landingOperation, taker.value, taken.value, arithmetic);
  const withMultiplier =
    taker.isDama && taken.isDama
      ? arithmetic.double(arithmetic.double(raw))
      : taker.isDama || taken.isDama
        ? arithmetic.double(raw)
        : raw;
  return arithmetic.finalizeScore(withMultiplier);
}
