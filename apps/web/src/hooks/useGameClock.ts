import { useEffect, useRef, useState } from 'react';

/** docs/DAMATH_RULES.md time control (§7.1-7.2): 20 minutes total, 60 seconds per move. */
export const GAME_CLOCK_SECONDS = 20 * 60;
export const MOVE_CLOCK_SECONDS = 60;

export interface UseGameClockOptions {
  /** Changes identity every time a new move starts — resets the per-move clock. */
  moveKey: number | string;
  /** Stops both clocks entirely: game over, browsing history, the computer's turn. */
  paused: boolean;
  /** §7.1: "the limit does not apply when a capture is mandatory" — waives the 60s clock, never the 20-minute one. */
  moveClockWaived: boolean;
  onMoveTimeout: () => void;
  onGameTimeout: () => void;
}

/**
 * Two independent countdowns ticking once a second. Reaching zero is reported via a
 * *separate* effect from the tick itself — never call a side-effecting callback from
 * inside a `setState` updater, which the tick's own updaters need to stay pure.
 */
export function useGameClock({ moveKey, paused, moveClockWaived, onMoveTimeout, onGameTimeout }: UseGameClockOptions) {
  const [gameSeconds, setGameSeconds] = useState(GAME_CLOCK_SECONDS);
  const [moveSeconds, setMoveSeconds] = useState(MOVE_CLOCK_SECONDS);

  useEffect(() => {
    setMoveSeconds(MOVE_CLOCK_SECONDS);
  }, [moveKey]);

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => {
      setGameSeconds((s) => Math.max(0, s - 1));
      if (!moveClockWaived) setMoveSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [paused, moveClockWaived]);

  const onGameTimeoutRef = useRef(onGameTimeout);
  onGameTimeoutRef.current = onGameTimeout;
  useEffect(() => {
    if (gameSeconds === 0) onGameTimeoutRef.current();
  }, [gameSeconds]);

  const onMoveTimeoutRef = useRef(onMoveTimeout);
  onMoveTimeoutRef.current = onMoveTimeout;
  useEffect(() => {
    if (moveSeconds === 0 && !moveClockWaived) onMoveTimeoutRef.current();
  }, [moveSeconds, moveClockWaived]);

  return { gameSeconds, moveSeconds };
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}
