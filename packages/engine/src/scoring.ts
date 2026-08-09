import type { Arithmetic } from './arithmetic.js';
import { operationAt } from './data/operation-layout.js';
import type { Operation, Piece, Position } from './types.js';

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

/** `arithmetic.substituteAt(a, pos.col, pos.row)` when defined, `a` unchanged otherwise — the one place both `scoreCaptureAt` and a caller's own display code (ledger.ts) apply the house rule, so neither has to repeat the "is this variant board-position-dependent at all" check. */
export function substituteValueAt<V>(a: V, pos: Position, arithmetic: Arithmetic<V>): V {
  return arithmetic.substituteAt ? arithmetic.substituteAt(a, pos.col, pos.row) : a;
}

/**
 * `scoreCapture`, but first substitutes both operands at the taker's landing square
 * when the variant defines `Arithmetic<V>.substituteAt` (Polynomial only) — the house
 * rule described there: a capture's score comes from each piece's value evaluated at
 * *where the capture lands*, not the printed symbolic term. Every other variant has no
 * `substituteAt`, so this is exactly `scoreCapture(taker, taken, operationAt(landedAt),
 * arithmetic)` for them — existing callers that only ever cared about the six
 * non-polynomial variants can switch to this unconditionally with no behavior change.
 */
export function scoreCaptureAt<V>(taker: Piece<V>, taken: Piece<V>, landedAt: Position, arithmetic: Arithmetic<V>): V {
  const takerForScoring = { ...taker, value: substituteValueAt(taker.value, landedAt, arithmetic) };
  const takenForScoring = { ...taken, value: substituteValueAt(taken.value, landedAt, arithmetic) };
  return scoreCapture(takerForScoring, takenForScoring, operationAt(landedAt), arithmetic);
}
