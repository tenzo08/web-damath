import { Avatar } from './Avatar';

interface PlayerCardProps {
  side: 'white' | 'black';
  label: string;
  avatarEmoji?: string | null;
  /** A real uploaded photo — takes priority over `avatarEmoji` when both are set. */
  avatarImage?: string | null;
  rating?: number | null;
  score: string;
  isTurn: boolean;
}

/**
 * One side's identity, directly above or below the board -- chess.com's own pattern,
 * replacing the old combined side-panel Score box (both sides' scores in one panel,
 * away from the board). Rendered twice per game (one above, one below), the pair
 * together carrying what ScorePanel used to show alone.
 */
export function PlayerCard({ side, label, avatarEmoji, avatarImage, rating, score, isTurn }: PlayerCardProps) {
  const dotColor = side === 'white' ? 'var(--piece-light)' : 'var(--piece-dark)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--gap-md)',
        background: 'var(--surface-panel)',
        border: isTurn ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-sm) var(--pad-md)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', minWidth: 0 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <Avatar size={32} imageUrl={avatarImage} emoji={avatarEmoji} fallbackLetter={label.charAt(0).toUpperCase()} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-meta)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
            {isTurn && (
              <span
                aria-label="to move"
                style={{
                  fontSize: 'var(--fs-micro)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  background: 'var(--accent-bg)',
                  borderRadius: 'var(--radius)',
                  padding: '1px 6px',
                }}
              >
                To move
              </span>
            )}
          </span>
          {rating !== null && rating !== undefined && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>Rating {rating}</span>}
        </span>
      </div>
      <span style={{ fontSize: 'var(--fs-title)', fontWeight: 700, flexShrink: 0 }}>{score}</span>
    </div>
  );
}
