import { formatClock, GAME_CLOCK_SECONDS, MOVE_CLOCK_SECONDS } from '../hooks/useGameClock';

interface ClockPanelProps {
  gameSeconds: number;
  moveSeconds: number;
  moveClockWaived: boolean;
}

function Row({ label, value, danger }: { label: string; value: string; danger: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-title)', fontWeight: 700, color: danger ? 'var(--danger)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

/** docs/DAMATH_RULES.md time control, rendered on the right alongside score/controls. */
export function ClockPanel({ gameSeconds, moveSeconds, moveClockWaived }: ClockPanelProps) {
  return (
    <section
      aria-label="Clock"
      style={{
        background: 'var(--surface-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gap-sm)',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--fs-micro)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Clock
      </h2>
      <Row label="Game (20:00 total)" value={formatClock(gameSeconds)} danger={gameSeconds <= 60 && gameSeconds > 0} />
      <Row
        label="This move (60s)"
        value={moveClockWaived ? 'no limit — capture forced' : formatClock(moveSeconds)}
        danger={!moveClockWaived && moveSeconds <= 10 && moveSeconds > 0}
      />
      <p style={{ margin: 0, fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>
        Run out of time on a move and the game plays a legal move for you automatically.
      </p>
    </section>
  );
}

export { GAME_CLOCK_SECONDS, MOVE_CLOCK_SECONDS };
