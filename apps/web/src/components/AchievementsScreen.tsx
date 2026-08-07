import { useEffect, useState } from 'react';
import { fetchAchievements, type AchievementView } from '../lib/achievementsClient';
import { hasSolvedFirstPuzzle } from '../lib/clientAchievements';

interface AchievementsScreenProps {
  token: string | null;
  onBackToLobby: () => void;
}

const cardStyle = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--pad-xl)',
} as const;

const secondaryButton = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-secondary)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  cursor: 'pointer',
} as const;

/** The one badge that can't be computed server-side — puzzles have no server-side tracking at all (lib/clientAchievements.ts), unlike every game-derived badge below it. */
const FIRST_PUZZLE_BADGE = {
  id: 'first_puzzle',
  title: 'Puzzle Solver',
  description: 'Solve a puzzle — curated, generated, daily, or in Puzzle Rush.',
  icon: '🧩',
};

function Badge({ icon, title, description, unlocked }: { icon: string; title: string; description: string; unlocked: boolean }) {
  return (
    <div
      role="group"
      aria-label={`${title}: ${unlocked ? 'unlocked' : 'locked'}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--gap-md)',
        padding: 'var(--pad-md)',
        borderRadius: 'var(--radius-card)',
        background: unlocked ? 'var(--accent-bg)' : 'var(--surface-raised)',
        opacity: unlocked ? 1 : 0.55,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 'var(--fs-display)', filter: unlocked ? undefined : 'grayscale(1)' }}>
        {icon}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 700, color: unlocked ? 'var(--accent)' : 'var(--text-primary)' }}>
          {title}
          {!unlocked && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · Locked</span>}
        </span>
        <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>{description}</span>
      </div>
    </div>
  );
}

/** "Achievements/badges... cheap to compute from existing game/puzzle events, adds a progression layer with no new infra." Every game-derived badge comes from GET /achievements (computed on request from existing GameStore data, no new persisted table); the one puzzle badge is tracked client-side (lib/clientAchievements.ts), since puzzles have no server-side persistence at all. */
export function AchievementsScreen({ token, onBackToLobby }: AchievementsScreenProps) {
  const [achievements, setAchievements] = useState<AchievementView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchAchievements(token)
      .then((a) => {
        if (!cancelled) setAchievements(a);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your achievements.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const puzzleUnlocked = hasSolvedFirstPuzzle();
  const unlockedCount = (achievements?.filter((a) => a.unlocked).length ?? 0) + (puzzleUnlocked ? 1 : 0);
  const totalCount = (achievements?.length ?? 0) + 1;

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(720px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← Lobby
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Achievements</h1>
          {achievements !== null && (
            <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
              {unlockedCount} / {totalCount} unlocked
            </span>
          )}
        </header>

        {!token && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Sign in to track your achievements.</p>
          </div>
        )}

        {token && error && (
          <div style={cardStyle}>
            <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
              {error}
            </p>
          </div>
        )}

        {token && !error && achievements === null && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p>
          </div>
        )}

        {token && !error && achievements !== null && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--gap-md)' }}>
            <Badge {...FIRST_PUZZLE_BADGE} unlocked={puzzleUnlocked} />
            {achievements.map((a) => (
              <Badge key={a.id} icon={a.icon} title={a.title} description={a.description} unlocked={a.unlocked} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
