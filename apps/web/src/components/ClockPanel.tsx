import { formatClock, GAME_CLOCK_SECONDS, MOVE_CLOCK_SECONDS } from '../hooks/useGameClock';

interface ClockPanelProps {
  gameSeconds: number;
  moveSeconds: number;
  moveClockWaived: boolean;
}

function Readout({ label, value, danger }: { label: string; value: string; danger: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 'var(--fs-micro)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-label)', fontWeight: 700, color: danger ? 'var(--danger)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

/**
 * docs/DAMATH_RULES.md time control, a compact bar sitting directly above the board
 * (chess.com's own convention) rather than a tall card in a side panel -- width-matched
 * to the board itself via the flex column it's rendered in, not just dropped in place
 * unstyled. The explanatory "auto-plays a legal move" text moved to a `title` tooltip
 * so the bar stays one line.
 */
export function ClockPanel({ gameSeconds, moveSeconds, moveClockWaived }: ClockPanelProps) {
  return (
    <section
      aria-label="Clock"
      title="Run out of time on a move and the game plays a legal move for you automatically."
      style={{
        width: '100%',
        background: 'var(--surface-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-sm) var(--pad-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--gap-xl)',
      }}
    >
      <Readout label="Game" value={formatClock(gameSeconds)} danger={gameSeconds <= 60 && gameSeconds > 0} />
      <Readout
        label="Move"
        value={moveClockWaived ? 'No limit' : formatClock(moveSeconds)}
        danger={!moveClockWaived && moveSeconds <= 10 && moveSeconds > 0}
      />
    </section>
  );
}

export { GAME_CLOCK_SECONDS, MOVE_CLOCK_SECONDS };
