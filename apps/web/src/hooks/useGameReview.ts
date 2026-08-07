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

  useEffect(() => {
    let cancelled = false;
    setReviews([]);
    setAnalyzing(true);

    function search(state: GameState<V>): Promise<SearchResult<V>> {
      return new Promise((resolve) => {
        const worker = new Worker(new URL('../ai-worker-entry.ts', import.meta.url), { type: 'module' });
        const id = `${String(Date.now())}-${String(Math.random())}`;
        worker.onmessage = (event: MessageEvent<AiWorkerResponse<V>>) => {
          if (event.data.id !== id) return;
          worker.terminate();
          resolve(event.data.result);
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

    void run();
    return () => {
      cancelled = true;
    };
  }, [variant.id, moveHistory.length]);

  return { reviews, analyzing, total: moveHistory.length };
}
