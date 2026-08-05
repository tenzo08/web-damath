import type { GameState, Player } from '@damath/engine';
import { playerLabel } from '../lib/notation';

interface ScorePanelProps<V> {
  game: GameState<V>;
  finalScores: Record<Player, V> | null;
  format: (value: V) => string;
  /** docs/AI_OPPONENT.md §9: a bot must always be visibly labelled, never a human-looking handle. */
  labelOverrides?: Partial<Record<Player, string>> | undefined;
}

function Row({
  player,
  score,
  active,
  label,
}: {
  player: Player;
  score: string;
  active: boolean;
  label: string;
}) {
  const color = player === 'white' ? 'var(--piece-light)' : 'var(--piece-dark)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--pad-sm) 0',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
        <span
          aria-hidden="true"
          style={{ width: 10, height: 10, borderRadius: '50%', background: color }}
        />
        <span style={{ fontSize: 'var(--fs-label)', color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {label}
        </span>
        {active && (
          <span
            style={{
              fontSize: 'var(--fs-micro)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              background: 'var(--accent-bg)',
              borderRadius: 'var(--radius)',
              padding: '2px 6px',
            }}
          >
            To move
          </span>
        )}
      </span>
      <span style={{ fontSize: 'var(--fs-display)', fontWeight: 700 }}>{score}</span>
    </div>
  );
}

export function ScorePanel<V>({ game, finalScores, format, labelOverrides }: ScorePanelProps<V>) {
  const scores = finalScores ?? game.scores;
  return (
    <section
      aria-label="Score"
      style={{
        background: 'var(--surface-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-lg)',
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
        Score
      </h2>
      <Row
        player="white"
        score={format(scores.white)}
        active={!finalScores && game.turn === 'white'}
        label={labelOverrides?.white ?? playerLabel('white')}
      />
      <Row
        player="black"
        score={format(scores.black)}
        active={!finalScores && game.turn === 'black'}
        label={labelOverrides?.black ?? playerLabel('black')}
      />
    </section>
  );
}
