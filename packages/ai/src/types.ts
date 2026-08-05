import type { Move } from '@damath/engine';

/**
 * `packages/ai` plays the three integer variants only (Whole, Counting, Integer) —
 * an evaluation function needs a numeric scale, and Fraction/Radical/Polynomial don't
 * have one yet (docs/AI_OPPONENT.md §4, docs/adr/0002).
 */
export type SupportedVariantId = 'whole' | 'counting' | 'integer';

export interface SearchOptions {
  readonly maxDepth: number;
  readonly timeBudgetMs: number;
  /** Deterministic play for tests — same position + same seed always produces the same move. */
  readonly seed?: number;
  /** 0..1. With this probability, play the second-best move instead of the best (§7). */
  readonly blunderRate?: number;
}

export interface SearchResult {
  readonly move: Move;
  /** Evaluation from the searching player's perspective. */
  readonly score: number;
  /** Depth actually completed within the time budget. */
  readonly depth: number;
  readonly nodesEvaluated: number;
  readonly timeMs: number;
}

/** A monotonic millisecond clock, injected so search stays free of hidden I/O and is testable without real waits. */
export type Clock = () => number;
