import { useEffect, useState } from 'react';
import { ALL_VARIANTS } from '@damath/engine';
import { liveGames, type LiveGameEntry } from '../lib/spectateClient';

interface SpectateScreenProps {
  token: string | null;
  onBackToLobby: () => void;
  onWatch: (roomId: string) => void;
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

function variantName(variantId: string): string {
  return ALL_VARIANTS.find((v) => v.id === variantId)?.name ?? variantId;
}

/** Every currently-in-progress human-vs-human game, chess.com-inspired suggestion (TASK.md, "spectating a live game"). Watching reuses OnlineGameScreen the same way MatchHistoryScreen's replay does, joined with `origin="spectate"` -- a spectator is never assigned a seat, so the server rejects any move/resign/draw action from them the same way it would any other non-player. */
export function SpectateScreen({ token, onBackToLobby, onWatch }: SpectateScreenProps) {
  const [games, setGames] = useState<LiveGameEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    function load() {
      liveGames(token as string)
        .then((g) => {
          if (!cancelled) setGames(g);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load live games.');
        });
    }
    load();
    // A light poll, not a WS subscription -- this list only needs to be roughly
    // current (picking something to watch), not update mid-glance the way an actual
    // game view does over /ws.
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(900px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← Lobby
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Spectate</h1>
        </header>

        {!token && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Sign in to watch live games.</p>
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
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No games in progress right now — check back in a bit.</p>
          </div>
        )}

        {token &&
          games !== null &&
          games.length > 0 &&
          games.map((entry) => (
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
                  {variantName(entry.variantId)} · {entry.whiteName ?? 'A player'} vs {entry.blackName ?? 'a player'}
                </span>
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                  {entry.moveCount} {entry.moveCount === 1 ? 'move' : 'moves'} so far
                </span>
              </div>
              <button type="button" onClick={() => onWatch(entry.id)} style={secondaryButton}>
                Watch
              </button>
            </div>
          ))}
      </div>
    </main>
  );
}
