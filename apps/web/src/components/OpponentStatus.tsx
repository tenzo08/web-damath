import { TIERS } from '@damath/ai';
import type { DifficultyTier } from '@damath/ai';

interface OpponentStatusProps {
  tier: DifficultyTier | null;
  thinking: boolean;
}

/**
 * Read-only — the opponent (friend vs. computer, and at what tier) is chosen once,
 * before the game starts, via `GameSetupModal`. There is deliberately no control here
 * to flip it mid-game: "the values for the AI should not be changeable whenever the
 * game already started." docs/AI_OPPONENT.md §9's labelling requirement (never a
 * human-looking handle for the bot) still applies, just as a status line now.
 */
export function OpponentStatus({ tier, thinking }: OpponentStatusProps) {
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
      {tier === null ? (
        <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>Local player — pass and play.</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
            Computer ({tier} — depth {TIERS[tier].maxDepth})
          </p>
          {thinking && <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--accent)' }}>Computer is thinking…</p>}
        </>
      )}
    </section>
  );
}
