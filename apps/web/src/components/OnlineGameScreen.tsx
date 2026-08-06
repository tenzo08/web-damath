import { useEffect, useState } from 'react';
import { ALL_VARIANTS } from '@damath/engine';
import type { Position, VariantId } from '@damath/engine';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { OnlineBoard } from './OnlineBoard';
import { SERVER_HTTP_URL } from '../lib/serverConfig';

interface OnlineGameScreenProps {
  token: string | null;
  onBackToLobby: () => void;
  onOpenLogin: () => void;
  /** Set when arriving via TournamentScreen's "Play this match" — joins that room directly instead of showing the variant picker/matchmaking flow. */
  initialRoomId?: string | undefined;
}

const cardStyle = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--pad-xl)',
} as const;

const primaryButton = {
  background: 'var(--accent)',
  color: 'var(--accent-on)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const secondaryButton = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-secondary)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  cursor: 'pointer',
} as const;

/**
 * "Play Online" — the real apps/server matchmaking flow (docs/AI_OPPONENT.md §9),
 * gracefully degraded when the server isn't reachable rather than erroring out, per
 * the request to showcase the flow even where it can't run in this environment.
 */
export function OnlineGameScreen({ token, onBackToLobby, onOpenLogin, initialRoomId }: OnlineGameScreenProps) {
  const online = useOnlineGame(token);
  const [variantId, setVariantId] = useState<VariantId>('integer');
  const [selected, setSelected] = useState<Position | null>(null);

  // Deliberately keyed on `token` alone, not `online.connect`/`online.disconnect` — both
  // are re-created every render (they close over `token` themselves), and including them
  // here would tear the socket down and reopen it on every render instead of once per
  // token change.
  useEffect(() => {
    online.connect();
    return () => online.disconnect();
  }, [token]);

  // `online.joinRoom` is stable (useCallback closing only over the stable `send`), so
  // this fires exactly once per connection: the instant `status` reaches 'idle' after
  // `connect()` opens the socket, provided a tournament match handed off a specific room.
  useEffect(() => {
    if (initialRoomId && online.status === 'idle') online.joinRoom(initialRoomId);
  }, [initialRoomId, online.status, online.joinRoom]);

  useEffect(() => setSelected(null), [online.view?.moveCount]);

  function activateSquare(pos: Position) {
    if (!online.view || online.color === null) return;
    const piece = online.view.board[pos.row]?.[pos.col] ?? null;
    if (selected) {
      if (piece && piece.owner === online.color) {
        setSelected(pos);
        return;
      }
      online.move(selected, pos);
      setSelected(null);
      return;
    }
    if (piece && piece.owner === online.color) setSelected(pos);
  }

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← {initialRoomId ? 'Tournament' : 'Lobby'}
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>{initialRoomId ? 'Tournament Match' : 'Play Online'}</h1>
        </header>

        {!token && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 var(--pad-md) 0', color: 'var(--text-secondary)' }}>
              Sign in to find a real opponent — the server pairs you with another signed-in player, or a computer
              opponent if no one's waiting.
            </p>
            <button type="button" onClick={onOpenLogin} style={primaryButton}>
              Sign in
            </button>
          </div>
        )}

        {token && online.status === 'connecting' && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Connecting to {SERVER_HTTP_URL}…</p>
          </div>
        )}

        {token && online.status === 'unreachable' && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 var(--pad-sm) 0', color: 'var(--danger)' }}>{online.error ?? "Can't reach the multiplayer server."}</p>
            <p style={{ margin: '0 0 var(--pad-lg) 0', fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
              This is what the flow looks like once <code>apps/server</code> is running (<code>pnpm -F server dev</code>): pick a
              variant, find a match, and the server pairs you with another player or, after a short wait, a labelled
              computer opponent — never silently.
            </p>
            <div style={{ display: 'flex', gap: 'var(--gap-sm)', opacity: 0.5, pointerEvents: 'none', marginBottom: 'var(--pad-lg)' }}>
              <select disabled style={{ ...secondaryButton, cursor: 'default' }}>
                <option>Integer Damath</option>
              </select>
              <button type="button" disabled style={primaryButton}>
                Find match
              </button>
            </div>
            <button type="button" onClick={online.connect} style={secondaryButton}>
              Try again
            </button>
          </div>
        )}

        {token && online.status === 'idle' && initialRoomId && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Joining the match…</p>
          </div>
        )}

        {token && online.status === 'idle' && !initialRoomId && (
          <div style={cardStyle}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)', maxWidth: 320 }}>
              <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>Variant</span>
              <select value={variantId} onChange={(e) => setVariantId(e.target.value as VariantId)} style={{ ...secondaryButton, cursor: 'pointer' }}>
                {ALL_VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gradeLevel})
                  </option>
                ))}
              </select>
            </label>
            <p style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', margin: 'var(--pad-sm) 0 var(--pad-lg) 0' }}>
              Pairing you with a player. If none is available we'll match you with the computer.
            </p>
            <button type="button" onClick={() => online.queue(variantId)} style={primaryButton}>
              Find match
            </button>
          </div>
        )}

        {online.status === 'queued' && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 var(--pad-lg) 0', color: 'var(--text-secondary)' }}>Waiting for an opponent…</p>
            <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
              <button type="button" onClick={online.declineBot} style={secondaryButton}>
                Keep waiting for a human
              </button>
              <button type="button" onClick={online.cancelQueue} style={secondaryButton}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {online.status === 'in_game' && online.view && (
          <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '3 1 480px', maxWidth: 760 }}>
              <OnlineBoard view={online.view} selected={selected} myColor={online.color} onActivateSquare={activateSquare} />
            </div>
            <div style={{ flex: '1 1 280px', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
              <div style={cardStyle}>
                <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                  You're {online.color === 'white' ? 'Light' : 'Dark'} ·{' '}
                  {online.view.opponentType === 'bot' ? `vs Computer (${online.view.botTier ?? '?'})` : 'vs a player'}
                </p>
                <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-label)' }}>
                  Light {online.view.scores.white} — Dark {online.view.scores.black}
                </p>
                <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                  {online.view.status === 'finished'
                    ? online.view.resignedBy
                      ? `${online.view.resignedBy === 'white' ? 'Light' : 'Dark'} resigned — ${online.view.winner === 'white' ? 'Light' : 'Dark'} wins.`
                      : online.view.winner
                        ? `Game over — ${online.view.winner === 'white' ? 'Light' : 'Dark'} wins.`
                        : 'Game over — draw.'
                    : `${online.view.turn === 'white' ? 'Light' : 'Dark'} to move`}
                </p>
              </div>
              {online.view.status !== 'finished' && (
                <button type="button" onClick={online.resign} style={{ ...secondaryButton, color: 'var(--danger)' }}>
                  Resign
                </button>
              )}
              {online.error && (
                <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
                  {online.error}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
