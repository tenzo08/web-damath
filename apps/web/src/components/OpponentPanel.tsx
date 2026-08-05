import { TIERS } from '@damath/ai';
import type { DifficultyTier } from '@damath/ai';

const TIER_ORDER: readonly DifficultyTier[] = ['learner', 'steady', 'sharp', 'tournament'];

interface OpponentPanelProps {
  tier: DifficultyTier | null;
  onChange: (tier: DifficultyTier | null) => void;
  thinking: boolean;
}

/**
 * docs/AI_OPPONENT.md §9: a bot opponent must always be visibly labelled as the
 * computer, never given a human-looking handle — Dark is named "Computer (tier)" the
 * moment practice mode is on, here and in the score panel's turn indicator.
 */
export function OpponentPanel({ tier, onChange, thinking }: OpponentPanelProps) {
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', fontSize: 'var(--fs-body)' }}>
        <input
          type="checkbox"
          checked={tier !== null}
          onChange={(e) => onChange(e.target.checked ? 'steady' : null)}
        />
        Play the computer (Dark)
      </label>
      {tier !== null && (
        <div style={{ marginTop: 'var(--pad-sm)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TIER_ORDER.map((candidate) => (
            <label
              key={candidate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--gap-sm)',
                fontSize: 'var(--fs-meta)',
                color: 'var(--text-secondary)',
              }}
            >
              <input
                type="radio"
                name="tier"
                value={candidate}
                checked={tier === candidate}
                onChange={() => onChange(candidate)}
              />
              {candidate} — depth {TIERS[candidate].maxDepth}
            </label>
          ))}
          {thinking && (
            <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--accent)' }}>
              Computer is thinking…
            </p>
          )}
        </div>
      )}
    </section>
  );
}
