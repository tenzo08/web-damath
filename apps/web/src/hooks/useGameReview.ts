import { useEffect, useState } from 'react';
import { applyMove, createGame } from '@damath/engine';
import type { GameState, Move, Variant } from '@damath/engine';
import type { AiWorkerRequest, AiWorkerResponse, SearchResult } from '@damath/ai';
import { REVIEW_SEARCH_OPTIONS, reviewPly, type PlyReview } from '../lib/gameReview';

/**
 * Runs `reviewPly` for every move in a finished game's history, sequentially (one Web
 * Worker per search request, same "practice mode never blocks the UI thread" reasoning
 * `useComputerOpponent` already uses) — up to two searches per ply, so results stream in
 * as `reviews` grows rather than the caller waiting for the whole game to finish before
 * showing anything.
 *
 * Depends on `variant.id`/`moveHistory.length`, not the `moveHistory` array reference
 * itself — a review is only ever run against a finished game's history, which doesn't
 * change shape for a fixed length, and re-deriving the array on every parent render
 * (the caller casts it from a wire/JSON boundary) would otherwise restart the whole
 * analysis on every unrelated re-render.
 */
export function useGameReview<V>(variant: Variant<V>, moveHistory: readonly Move<V>[]) {
  const [reviews, setReviews] = useState<PlyReview<V>[]>([]);
  const [analyzing, setAnalyzing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The one live Worker at any given moment, reachable from this effect's own cleanup
    // — without this, navigating away mid-analysis (or a fast unmount+remount) left the
    // in-flight worker running a full search to completion in the background regardless
    // of `cancelled`, since `search()`'s only termination path used to be its own
    // `onmessage` handler finishing normally.
    let liveWorker: Worker | null = null;
    setReviews([]);
    setAnalyzing(true);
    setError(null);

    function search(state: GameState<V>): Promise<SearchResult<V>> {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../ai-worker-entry.ts', import.meta.url), { type: 'module' });
        liveWorker = worker;
        const id = `${String(Date.now())}-${String(Math.random())}`;
        worker.onmessage = (event: MessageEvent<AiWorkerResponse<V>>) => {
          if (event.data.id !== id) return;
          worker.terminate();
          if (liveWorker === worker) liveWorker = null;
          resolve(event.data.result);
        };
        // Without this, a worker that throws (a bundling issue, a genuine runtime bug
        // inside @damath/ai) leaves this Promise permanently unresolved — `analyzing`
        // would stay `true` forever with no way for the UI to know anything went wrong,
        // unlike LeaderboardScreen's own fetch, which has a real error path.
        worker.onerror = (event: ErrorEvent) => {
          worker.terminate();
          if (liveWorker === worker) liveWorker = null;
          reject(new Error(event.message || 'The analysis worker failed unexpectedly.'));
        };
        const request: AiWorkerRequest<V> = { id, state, tier: 'sharp', options: REVIEW_SEARCH_OPTIONS };
        worker.postMessage(request);
      });
    }

    async function run() {
      let state: GameState<V> = createGame(variant);
      const results: PlyReview<V>[] = [];
      for (let i = 0; i < moveHistory.length; i++) {
        if (cancelled) return;
        const move = moveHistory[i];
        if (!move) continue;
        const review = await reviewPly(variant, state, move, i + 1, search);
        if (cancelled) return;
        results.push(review);
        setReviews([...results]);
        state = applyMove(state, move, variant, { checkGameOver: false });
      }
      if (!cancelled) setAnalyzing(false);
    }

    run().catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Could not analyze this game.');
      setAnalyzing(false);
    });

    return () => {
      cancelled = true;
      liveWorker?.terminate();
      liveWorker = null;
    };
  }, [variant.id, moveHistory.length]);

  return { reviews, analyzing, error, total: moveHistory.length };
}
