import type { Operation, Piece } from './types.js';

function rawResult(operation: Operation, takerValue: number, takenValue: number): number {
  switch (operation) {
    case '+':
      return takerValue + takenValue;
    case '-':
      return takerValue - takenValue;
    case '*':
      return takerValue * takenValue;
    case '/':
      // Division by zero contributes 0 (§5.5) — neither reference nor the rulebook
      // treats this as an error.
      return takenValue === 0 ? 0 : takerValue / takenValue;
  }
}

/**
 * Score for one capture: `takerValue OP takenValue` using the operation on the
 * square the taker lands on (§5.1), times the §5.3 dama multiplier. A result
 * with magnitude under 1 counts as 0; otherwise it truncates toward zero
 * (KNOWLEDGE.md, "Division truncation" — the only operation that can produce a
 * non-integer raw result on integer chip values).
 */
export function scoreCapture(taker: Piece, taken: Piece, landingOperation: Operation): number {
  const raw = rawResult(landingOperation, taker.value, taken.value);
  const multiplier = taker.isDama && taken.isDama ? 4 : taker.isDama || taken.isDama ? 2 : 1;
  const result = raw * multiplier;
  return Math.abs(result) < 1 ? 0 : Math.trunc(result);
}
