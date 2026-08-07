interface OpponentStatusProps {
  /** `null` for hot-seat local play; a friendly nickname (lib/botNicknames.ts) when the opponent is the computer -- never "Computer" or the difficulty tier, by direct product decision (docs/AI_OPPONENT.md §9's own reasoning still applies to the underlying tracking, just not to what's displayed). */
  opponentName: string | null;
  thinking: boolean;
}

/**
 * Read-only — the opponent (friend vs. computer, and at what tier) is chosen once,
 * before the game starts, via `GameSetupModal`. There is deliberately no control here
 * to flip it mid-game: "the values for the AI should not be changeable whenever the
 * game already started."
 */
export function OpponentStatus({ opponentName, thinking }: OpponentStatusProps) {
  return (
    <section
      aria-label="Opponent"
      style={{
        background: 'var(--surface-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-lg)',
      }}
    >
      <h2
        style={{
          margin: '0 0 var(--pad-sm) 0',
          fontSize: 'var(--fs-micro)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Opponent
      </h2>
      {opponentName === null ? (
        <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>Local player — pass and play.</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>{opponentName}</p>
          {thinking && <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--accent)' }}>{opponentName} is thinking…</p>}
        </>
      )}
    </section>
  );
}
