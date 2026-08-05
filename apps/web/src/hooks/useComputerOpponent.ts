import { useEffect, useRef } from 'react';
import type { GameState, Move, Player } from '@damath/engine';
import type { AiWorkerRequest, AiWorkerResponse, DifficultyTier } from '@damath/ai';

/**
 * Practice mode (docs/AI_OPPONENT.md §3, §9): runs entirely client-side in a Web
 * Worker, one per move — cheap enough (worker startup is a few ms next to a
 * multi-hundred-ms search) and it sidesteps any stale-request bookkeeping, since a
 * changed `game` (new move played, or a new match started) just tears the old worker
 * down in the effect's cleanup before a new one spins up.
 */
export function useComputerOpponent(
  game: GameState<number>,
  tier: DifficultyTier | null,
  computerPlayer: Player,
  onMove: (move: Move<number>) => void,
) {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!tier) return undefined;
    if (game.status === 'finished') return undefined;
    if (game.turn !== computerPlayer) return undefined;

    const worker = new Worker(new URL('../ai-worker-entry.ts', import.meta.url), { type: 'module' });
    const id = `${Date.now()}-${String(Math.random())}`;

    worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
      if (event.data.id !== id) return;
      onMoveRef.current(event.data.result.move);
    };

    const request: AiWorkerRequest = { id, state: game, tier };
    worker.postMessage(request);

    return () => worker.terminate();
  }, [game, tier, computerPlayer]);
}
