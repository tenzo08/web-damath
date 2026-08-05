interface GameControlsProps {
  canUndo: boolean;
  canResign: boolean;
  isViewingHistory: boolean;
  flipped: boolean;
  onUndo: () => void;
  onResign: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onFlip: () => void;
}

function ControlButton({
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: '1 1 auto',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: disabled ? 'var(--text-disabled)' : danger ? 'var(--danger, #e35b5b)' : 'var(--text-secondary)',
        fontSize: 'var(--fs-meta)',
        padding: 'var(--pad-sm) var(--pad-md)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

/**
 * Hot-seat local play has no server to enforce anything, so these are trust-based
 * conveniences, not rules: undo (replays moveHistory minus one move through the real
 * engine — never a hand-rolled inverse), resign (forfeits without needing a legal
 * "no moves" or repetition condition), step back/forward through the move ledger
 * (read-only browsing, doesn't touch the live game — see MoveLedger's scrubber), and
 * flip board (pass-and-play convenience, purely visual).
 */
export function GameControls({
  canUndo,
  canResign,
  isViewingHistory,
  flipped,
  onUndo,
  onResign,
  onStepBack,
  onStepForward,
  onFlip,
}: GameControlsProps) {
  return (
    <section
      aria-label="Game controls"
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
      <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
        <ControlButton label="◂ Back" onClick={onStepBack} disabled={!canUndo} />
        <ControlButton label="Forward ▸" onClick={onStepForward} disabled={!isViewingHistory} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
        <ControlButton label="Undo move" onClick={onUndo} disabled={!canUndo} />
        <ControlButton label="Flip board" onClick={onFlip} disabled={false} />
      </div>
      <ControlButton label="Resign" onClick={onResign} disabled={!canResign} danger />
      {flipped && (
        <p style={{ margin: 0, fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>Board flipped to Dark&apos;s view.</p>
      )}
    </section>
  );
}
