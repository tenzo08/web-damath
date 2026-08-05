# @damath/engine

Pure TypeScript rules engine for Damath. No I/O, no framework dependencies, no `any`.
Implements the three integer-valued variants — **Whole**, **Counting**, and **Integer**
Damath (`docs/VARIANTS.md`). Every exported function is a pure transform: given the same
inputs, always the same outputs, never a mutation of its arguments.

See `docs/DAMATH_RULES.md` for the rules this engine implements, and `KNOWLEDGE.md` for
the reasoning behind every place the official rulebook leaves a decision open (chip-row
orientation, division truncation, "cornered", "repetitive").

## Install

Workspace-internal package — import as `@damath/engine` from another package in this
pnpm workspace. It has zero runtime dependencies.

## Quick start

```ts
import { createGame, legalMoves, applyMove, isGameOver, finalScores } from '@damath/engine';

let state = createGame('integer'); // 'whole' | 'counting' | 'integer'

while (!isGameOver(state)) {
  const moves = legalMoves(state);
  state = applyMove(state, moves[0]); // pure — returns a new GameState
}

console.log(finalScores(state)); // { white: number, black: number }
```

## Public API

### Game lifecycle

- **`createGame(variantId: IntegerVariantId): GameState`**
  Builds the starting position for `'whole' | 'counting' | 'integer'`: 12 chips per
  player on rows 0–2 (white) and 5–7 (black), values placed per Mapping A
  (`KNOWLEDGE.md`, "Chip-row orientation").

- **`legalMoves(state: GameState): Move[]`**
  Every legal move for `state.turn`, with capture priority fully enforced: captures are
  mandatory whenever any exists (§4.2), only maximum-count sequences are legal among
  captures (§4.3), and Dama captures prevail over ordinary ones among the maximal set
  (§4.4). Returns quiet moves only when no capture is available.

- **`applyMove(state: GameState, move: Move): GameState`**
  Applies one move — normally one drawn from `legalMoves(state)` — and returns a new
  `GameState`. `state` is never mutated. Scores each capture step individually and sums
  them (§5.6), promotes a chip only when it *stops* on a promotion square (§6.1–6.2,
  never mid-chain), switches `turn`, and marks the result `status: 'finished'` when
  `isGameOver` holds for it.

- **`isGameOver(state: GameState): boolean`**
  True when the player to move has no legal move at all — this single check covers both
  "no chips left" and "cornered" (§7.3; see `KNOWLEDGE.md`, "Cornered" for why those two
  rulebook conditions collapse into one implementation check) — or the exact position
  has occurred three times with the same player to move (§7.5, threefold repetition).
  The 20-minute clock (§7.1) is wall-clock state; it belongs to the server/UI layer, not
  this pure engine.

- **`finalScores(state: GameState): Record<Player, number>`**
  Each player's accumulated capture score plus the value of their remaining chips, Dama
  counted double (§8.1–8.2).

- **`serialize(state: GameState): string`** / **`deserialize(json: string): GameState`**
  Round-trip a `GameState` to and from JSON, for persistence as a move list
  (`PLANNING.md`, "Games are stored as move lists").

### Supporting queries

- **`scoreCapture(taker: Piece, taken: Piece, landingOperation: Operation): number`**
  The score for one capture: `takerValue OP takenValue` using the operation on the
  square the taker lands on (§5.1), times the ×1/×2/×2/×4 Dama multiplier (§5.3).
  Division by zero and any `|result| < 1` both score `0` (§5.5, `KNOWLEDGE.md`
  "Division truncation"); otherwise the result truncates toward zero.

- **`pieceAt(board: Board, pos: Position): Piece | null`**, **`isOnBoard(pos: Position): boolean`**,
  **`BOARD_SIZE`** — board geometry helpers.

- **`OPERATION_LAYOUT: readonly OperationSquare[]`**, **`operationAt(pos: Position): Operation`**,
  **`PROMOTION_SQUARES_ROW_0`**, **`PROMOTION_SQUARES_ROW_7`** — the fixed board data from
  `docs/DAMATH_RULES.md` §1.3 and §6.1.

- **`INTEGER_VARIANTS: readonly IntegerVariant[]`** and the individual
  `WHOLE_DAMATH` / `COUNTING_DAMATH` / `INTEGER_DAMATH` constants — each variant's name,
  grade level, and 12 chip values in rulebook print order.

### Types

`Operation`, `Position`, `OperationSquare`, `Player`, `Piece`, `Board`, `CaptureStep`,
`Move`, `GameState`, `IntegerVariantId`, `IntegerVariant` — see `src/types.ts` and
`src/data/variants.ts`.

## What's deliberately not here

- **Legality checking inside `applyMove`.** `applyMove` trusts its `Move` argument; it
  does not re-derive `legalMoves(state)` to confirm the move is in that list. Servers
  must validate client moves against `legalMoves()` themselves (`PLANNING.md`, "Never
  trust the client") — `applyMove` is the state-transition primitive, not the referee.
- **Wall-clock time control (§7.1–7.2).** No timers, no `Date.now()`. That is UI/server
  state, not pure rules state.
- **Non-integer variants.** Fraction, Rational, Radical and Polynomial Damath need a
  chip-value type beyond `number` (`docs/adr/0002`) and are out of scope for this
  package's current milestone.

## Testing

```bash
pnpm -F @damath/engine test            # vitest run
pnpm -F @damath/engine test:watch
pnpm -F @damath/engine test:coverage   # ≥ 90% required, see TASK.md
```

Every rules-affecting test cites the `docs/DAMATH_RULES.md` section number it proves.
