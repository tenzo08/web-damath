import { operationAt, scoreCapture } from '@damath/engine';
import type { GameState, Move, Piece, Player } from '@damath/engine';
import { operationGlyph, playerLetter, toAlgebraic } from './notation';

export interface LedgerStep {
  readonly taker: number;
  readonly taken: number;
  readonly operation: string;
  readonly result: number;
}

export interface LedgerEntry {
  readonly ply: number;
  readonly player: Player;
  readonly move: Move;
  readonly steps: readonly LedgerStep[];
  readonly delta: number;
  readonly runningTotal: number;
  readonly promoted: boolean;
}

/**
 * Computes one ledger row for a move about to be applied. Uses the engine's own
 * exported `scoreCapture`/`operationAt` — the UI reads the same numbers `applyMove`
 * produces internally, it never reimplements the scoring rule (PLANNING.md, "UI
 * computes no rules").
 */
export function buildLedgerEntry(before: GameState, mover: Piece, move: Move, after: GameState): LedgerEntry {
  const steps: LedgerStep[] = move.captures.map((step) => ({
    taker: mover.value,
    taken: step.capturedPiece.value,
    operation: operationGlyph(operationAt(step.landedAt)),
    result: scoreCapture(mover, step.capturedPiece, operationAt(step.landedAt)),
  }));
  const delta = steps.reduce((sum, step) => sum + step.result, 0);
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

function pathNotation(entry: LedgerEntry): string {
  if (entry.steps.length === 0) {
    return `${toAlgebraic(entry.move.from)}→${toAlgebraic(entry.move.to)}`;
  }
  const squares = [entry.move.from, ...entry.move.captures.map((c) => c.landedAt)];
  const glyphs = entry.steps.map((s) => s.operation);
  return squares
    .map((sq, i) => {
      if (i === 0) return toAlgebraic(sq);
      const glyph = glyphs[i - 1];
      if (!glyph) throw new Error('unreachable: one glyph per capture step after the first square');
      return `${glyph}${toAlgebraic(sq)}`;
    })
    .join('');
}

function arithmeticNotation(entry: LedgerEntry): string {
  if (entry.steps.length === 0) return '';
  if (entry.steps.length === 1) {
    const s = entry.steps[0];
    if (!s) throw new Error('unreachable: steps.length === 1');
    return `${String(s.taker)} ${s.operation} ${String(s.taken)} = ${String(s.result)}`;
  }
  const terms = entry.steps.map((s) => String(s.result)).join(' + ');
  return `${terms} = ${String(entry.delta)}`;
}

/** One line per move, docs/DESIGN.md §8 — the signature element. */
export function formatLedgerRow(entry: LedgerEntry): {
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
    arithmetic: arithmeticNotation(entry),
    total: String(entry.runningTotal),
    promoted: entry.promoted,
  };
}
