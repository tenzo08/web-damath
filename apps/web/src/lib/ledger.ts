import { operationAt, scoreCapture } from '@damath/engine';
import type { GameState, Move, Piece, Player, Variant } from '@damath/engine';
import { operationGlyph, playerLetter, toCoord } from './notation';

export interface LedgerStep<V> {
  readonly taker: V;
  readonly taken: V;
  readonly operation: string;
  readonly result: V;
}

export interface LedgerEntry<V> {
  readonly ply: number;
  readonly player: Player;
  readonly move: Move<V>;
  readonly steps: readonly LedgerStep<V>[];
  readonly delta: V;
  readonly runningTotal: V;
  readonly promoted: boolean;
}

/**
 * Computes one ledger row for a move about to be applied. Uses the engine's own
 * exported `scoreCapture`/`operationAt` — the UI reads the same numbers `applyMove`
 * produces internally, it never reimplements the scoring rule (PLANNING.md, "UI
 * computes no rules").
 */
export function buildLedgerEntry<V>(
  before: GameState<V>,
  mover: Piece<V>,
  move: Move<V>,
  after: GameState<V>,
  variant: Variant<V>,
): LedgerEntry<V> {
  const arithmetic = variant.arithmetic;
  const steps: LedgerStep<V>[] = move.captures.map((step) => ({
    taker: mover.value,
    taken: step.capturedPiece.value,
    operation: operationGlyph(operationAt(step.landedAt)),
    result: scoreCapture(mover, step.capturedPiece, operationAt(step.landedAt), arithmetic),
  }));
  const delta = steps.reduce((sum, step) => arithmetic.add(sum, step.result), arithmetic.zero);
  const promoted = !mover.isDama && after.board[move.to.row]?.[move.to.col]?.isDama === true;

  return {
    ply: before.moveHistory.length + 1,
    player: mover.owner,
    move,
    steps,
    delta,
    runningTotal: after.scores[mover.owner],
    promoted,
  };
}

/**
 * A quiet move has nothing else to record, so it's the origin/destination squares. A
 * capture's own record is the pieces involved (arithmeticNotation, by value) per the
 * rulebook's own scoresheet convention (§ "record his or her move... and the
 * corresponding score") — the squares it happened on add nothing a reader needs.
 */
function pathNotation<V>(entry: LedgerEntry<V>): string {
  if (entry.steps.length === 0) {
    return `${toCoord(entry.move.from)}→${toCoord(entry.move.to)}`;
  }
  return '';
}

function arithmeticNotation<V>(entry: LedgerEntry<V>, format: (v: V) => string): string {
  if (entry.steps.length === 0) return '';
  if (entry.steps.length === 1) {
    const s = entry.steps[0];
    if (!s) throw new Error('unreachable: steps.length === 1');
    return `${format(s.taker)} ${s.operation} ${format(s.taken)} = ${format(s.result)}`;
  }
  const terms = entry.steps.map((s) => format(s.result)).join(' + ');
  return `${terms} = ${format(entry.delta)}`;
}

/** One line per move, docs/DESIGN.md §8 — the signature element. */
export function formatLedgerRow<V>(
  entry: LedgerEntry<V>,
  format: (v: V) => string,
): {
  index: string;
  player: string;
  path: string;
  arithmetic: string;
  total: string;
  promoted: boolean;
} {
  return {
    index: `${String(entry.ply)}.`,
    player: playerLetter(entry.player),
    path: pathNotation(entry),
    arithmetic: arithmeticNotation(entry, format),
    total: format(entry.runningTotal),
    promoted: entry.promoted,
  };
}
