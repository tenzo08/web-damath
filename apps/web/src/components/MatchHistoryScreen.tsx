import { useEffect, useState } from 'react';
import { ALL_VARIANTS } from '@damath/engine';
import { myGameHistory, type GameHistoryEntry } from '../lib/gameHistoryClient';
import { ReportBlockButtons } from './ReportBlockButtons';

interface MatchHistoryScreenProps {
  token: string | null;
  onBackToLobby: () => void;
  /** Opens OnlineGameScreen joined directly to this past game -- finished games are read-only there (the server refuses any move/resign on a finished room), an active one resumes live play. */
  onViewGame: (roomId: string) => void;
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

const RESULT_STYLE: Record<'win' | 'loss' | 'draw' | 'active', { label: string; color: string }> = {
  win: { label: 'Win', color: 'var(--success, #3fb950)' },
  loss: { label: 'Loss', color: 'var(--danger)' },
  draw: { label: 'Draw', color: 'var(--text-muted)' },
  active: { label: 'In progress', color: 'var(--accent)' },
};

function variantName(variantId: string): string {
  return ALL_VARIANTS.find((v) => v.id === variantId)?.name ?? variantId;
}

function opponentLabel(entry: GameHistoryEntry): string {
  if (entry.opponentType === 'bot') return `Computer (${entry.botTier ?? '?'})`;
  return entry.opponentName ?? 'A former player';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A signed-in user's past online games -- chess.com-inspired suggestion #2 (TASK.md). Reuses OnlineGameScreen for the actual "replay": a finished game is read-only there (the server already refuses any move/resign on a room whose status is 'finished'), an active one resumes live play. */
export function MatchHistoryScreen({ token, onBackToLobby, onViewGame }: MatchHistoryScreenProps) {
  const [games, setGames] = useState<GameHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    myGameHistory(token)
      .then((g) => {
        if (!cancelled) setGames(g);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your match history.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(900px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← Lobby
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Match History</h1>
        </header>

        {!token && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Sign in to see your past online games.</p>
          </div>
        )}

        {token && error && (
          <div style={cardStyle}>
            <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
              {error}
            </p>
          </div>
        )}

        {token && !error && games === null && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p>
          </div>
        )}

        {token && !error && games !== null && games.length === 0 && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              No online games yet — play one from the lobby and it'll show up here.
            </p>
          </div>
        )}

        {token &&
          games !== null &&
          games.length > 0 &&
          games.map((entry) => {
            const resultKey = entry.status === 'active' ? 'active' : (entry.result ?? 'draw');
            const { label, color } = RESULT_STYLE[resultKey];
            return (
              <div
                key={entry.id}
                style={{
                  ...cardStyle,
                  padding: 'var(--pad-md) var(--pad-lg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--gap-md)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 700 }}>
                    {variantName(entry.variantId)} vs {opponentLabel(entry)}
                  </span>
                  <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                    {formatDate(entry.updatedAt)} · {entry.moveCount} {entry.moveCount === 1 ? 'move' : 'moves'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
                  <span style={{ fontWeight: 700, color }}>{label}</span>
                  {token && entry.opponentUserId && (
                    <ReportBlockButtons token={token} targetUserId={entry.opponentUserId} targetName={entry.opponentName ?? 'this player'} />
                  )}
                  <button type="button" onClick={() => onViewGame(entry.id)} style={secondaryButton}>
                    {entry.status === 'active' ? 'Resume' : 'Replay'}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </main>
  );
}
