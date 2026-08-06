import type { Move } from '@damath/engine';

export interface SearchOptions {
  readonly maxDepth: number;
  readonly timeBudgetMs: number;
  /** Deterministic play for tests — same position + same seed always produces the same move. */
  readonly seed?: number;
  /** 0..1. With this probability, play the second-best move instead of the best (§7). */
  readonly blunderRate?: number;
}

export interface SearchResult<V> {
  readonly move: Move<V>;
  /** Evaluation from the searching player's perspective — always a plain number, regardless of the variant's chip-value type (valueScale.ts's `ToNumber<V>` bridge). Never the actual on-board/final score, which stays exact and `V`-typed everywhere else in the engine. */
  readonly score: number;
  /** Depth actually completed within the time budget. */
  readonly depth: number;
  readonly nodesEvaluated: number;
  readonly timeMs: number;
}

/** A monotonic millisecond clock, injected so search stays free of hidden I/O and is testable without real waits. */
export type Clock = () => number;
