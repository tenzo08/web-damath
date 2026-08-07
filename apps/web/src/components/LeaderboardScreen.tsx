import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LeaderboardEntry } from '../lib/leaderboardClient';
import { Avatar } from './Avatar';

interface LeaderboardScreenProps {
  token: string | null;
  /** Highlights the signed-in viewer's own row, if it's in the list — the same "where do I rank" question the page exists to answer. */
  myUserId: string | null;
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

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** Top-N players by Elo rating (rating/elo.ts) — "A real leaderboard... a top-N leaderboard is a cheap query against existing data and a strong retention hook" (TASK.md-shaped feature request). */
export function LeaderboardScreen({ token, myUserId, onBackToLobby }: LeaderboardScreenProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchLeaderboard(token)
      .then((e) => {
        if (!cancelled) setEntries(e);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(720px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← Lobby
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Leaderboard</h1>
        </header>

        {!token && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Sign in to see the leaderboard and where you rank.</p>
          </div>
        )}

        {token && error && (
          <div style={cardStyle}>
            <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
              {error}
            </p>
          </div>
        )}

        {token && !error && entries === null && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p>
          </div>
        )}

        {token && !error && entries !== null && entries.length === 0 && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              No rated players yet — play an online or computer match and ratings will start showing up here.
            </p>
          </div>
        )}

        {token && entries !== null && entries.length > 0 && (
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--gap-md)',
                  padding: 'var(--pad-sm) var(--pad-lg)',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  background: entry.id === myUserId ? 'var(--accent-bg)' : 'transparent',
                }}
              >
                <span aria-label={`Rank ${String(entry.rank)}`} style={{ width: 32, textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {RANK_MEDAL[entry.rank] ?? entry.rank}
                </span>
                <Avatar size={32} imageUrl={entry.avatarImage} emoji={entry.avatarEmoji} fallbackLetter={entry.displayName.charAt(0).toUpperCase()} />
                <span style={{ flex: 1, minWidth: 0, fontWeight: entry.id === myUserId ? 700 : 400, color: entry.id === myUserId ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {entry.displayName}
                  {entry.id === myUserId && ' (you)'}
                </span>
                {entry.provisional && (
                  <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }} title="Still inside its first few games — the rating hasn't settled yet.">
                    provisional
                  </span>
                )}
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{entry.rating}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
