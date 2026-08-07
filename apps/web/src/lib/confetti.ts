/**
 * A handful of small confetti pieces, fixed positions/delays (no `Math.random()` — a
 * deterministic burst is enough for a two-second flourish, and avoids a game-over panel
 * ever rendering visibly differently between two mounts of the same state). Shared
 * between GameOverModal (local/practice play) and OnlineGameScreen (online play) so both
 * winner announcements get the identical burst, styled via global.css's `.confetti-piece`.
 */
export const CONFETTI_PIECES = [
  { left: '10%', delay: '0ms', color: 'var(--accent)' },
  { left: '25%', delay: '80ms', color: 'var(--piece-light)' },
  { left: '42%', delay: '40ms', color: 'var(--accent)' },
  { left: '58%', delay: '120ms', color: 'var(--piece-dark)' },
  { left: '75%', delay: '20ms', color: 'var(--accent)' },
  { left: '90%', delay: '100ms', color: 'var(--piece-light)' },
] as const;
