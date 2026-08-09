import { useEffect, useState } from 'react';
import { ALL_VARIANTS } from '@damath/engine';
import type { VariantId } from '@damath/engine';
import type { AuthUser } from '../lib/authClient';
import * as tournamentClient from '../lib/tournamentClient';
import type { Match, Standing, Tournament } from '../lib/tournamentClient';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { OfflineBanner } from './OfflineBanner';
import { TournamentAnalyticsScreen } from './TournamentAnalyticsScreen';

interface TournamentScreenProps {
  token: string | null;
  user: AuthUser | null;
  onBackToLobby: () => void;
  onOpenLogin: () => void;
  /** Re-opens the same tournament's detail view after a "Play this match" round trip through OnlineGameScreen — see App.tsx's `tournamentContext`. */
  initialSelectedId?: string | null;
  /** Fires once the match's room has been created — App.tsx switches to OnlineGameScreen with it. */
  onPlayMatch: (tournamentId: string, roomId: string) => void;
  /** Bumps every time any tournament changes anywhere — App.tsx's `useLiveUpdates`. Triggers a refetch of whatever's currently shown, so a new tournament (or someone else joining/starting one) appears automatically, no manual refresh needed. */
  tournamentEventCount: number;
  /** How many users are currently connected — `null` while signed out or still connecting. */
  onlineCount: number | null;
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

const inputStyle = {
  padding: 'var(--pad-sm) var(--pad-md)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  fontSize: 'var(--fs-body)',
} as const;

function shortId(id: string): string {
  return id.slice(0, 8);
}

function playerLabel(id: string | null, user: AuthUser | null): string {
  if (id === null) return 'TBD';
  if (user && id === user.id) return `${user.displayName} (you)`;
  return shortId(id);
}

/** `<input type="datetime-local">` gives `"YYYY-MM-DDTHH:mm"` in the browser's local time zone, with no timezone info — `new Date(...)` interprets that as local time, exactly matching what the user picked, and `.toISOString()` converts it to the UTC the server stores. */
function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatSchedule(startTime: string | null, endTime: string | null): string | null {
  if (!startTime && !endTime) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  if (startTime && endTime) return `${fmt(startTime)} – ${fmt(endTime)}`;
  if (startTime) return `Starts ${fmt(startTime)}`;
  return `Closes ${fmt(endTime as string)}`;
}

/**
 * "Play this match" creates a room seated for that exact bracket match and hands off to
 * OnlineGameScreen; once it finishes with a clear winner, apps/server auto-reports the
 * result (RoomManager's `onTournamentMatchFinished`, wired in app.ts) and this screen
 * picks up the change on the next `refreshDetail`. These buttons stay as a manual
 * fallback — a drawn match (no automatic tiebreak, docs/DAMATH_RULES.md) or one played
 * outside the app still needs someone to declare a winner by hand.
 */
function ReportButtons({
  match,
  user,
  onReport,
}: {
  match: Match & { playerA: string; playerB: string };
  user: AuthUser | null;
  onReport: (match: Match, winnerId: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 'var(--pad-sm)' }}>
      <button
        type="button"
        onClick={() => onReport(match, match.playerA)}
        style={{ ...secondaryButton, padding: '2px 6px', fontSize: 'var(--fs-micro)' }}
      >
        {playerLabel(match.playerA, user)} won
      </button>
      <button
        type="button"
        onClick={() => onReport(match, match.playerB)}
        style={{ ...secondaryButton, padding: '2px 6px', fontSize: 'var(--fs-micro)' }}
      >
        {playerLabel(match.playerB, user)} won
      </button>
    </div>
  );
}

export function TournamentScreen({
  token,
  user,
  onBackToLobby,
  onOpenLogin,
  initialSelectedId,
  onPlayMatch,
  tournamentEventCount,
  onlineCount,
}: TournamentScreenProps) {
  const [list, setList] = useState<Tournament[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [detail, setDetail] = useState<{ tournament: Tournament; standings: Standing[] } | null>(null);
  const [name, setName] = useState('');
  const [variantId, setVariantId] = useState<VariantId>('integer');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reachable, setReachable] = useState(true);
  // Renders TournamentAnalyticsScreen in place of the normal detail view instead of a
  // whole new top-level Screen/URL — it's a sub-view of one tournament's detail, not
  // its own destination, same "modal, not a route" reasoning GameSetupModal already
  // uses. Reset whenever the selected tournament changes so navigating detail -> list
  // -> a different tournament never leaves a stale analytics view showing.
  const [showAnalytics, setShowAnalytics] = useState(false);
  const isOnline = useOnlineStatus();

  function refreshList() {
    tournamentClient
      .listTournaments()
      .then((r) => {
        setList(r.tournaments);
        setReachable(true);
      })
      .catch(() => setReachable(false));
  }

  // `tournamentEventCount` bumps whenever any tournament changes anywhere (App.tsx's
  // `useLiveUpdates`) — this is what makes a newly-created tournament, or someone else
  // joining/starting one, "appear automatically to all the users that are online"
  // instead of needing a manual refresh.
  useEffect(refreshList, [tournamentEventCount]);

  function refreshDetail(id: string) {
    tournamentClient
      .getTournament(id)
      .then(setDetail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    if (selectedId) refreshDetail(selectedId);
    else setDetail(null);
  }, [selectedId, tournamentEventCount]);

  useEffect(() => setShowAnalytics(false), [selectedId]);

  async function handleCreate() {
    if (!token) return;
    setError(null);
    try {
      const { tournament } = await tournamentClient.createTournament(token, name.trim(), variantId, {
        startTime: localDateTimeToIso(startTime),
        endTime: localDateTimeToIso(endTime),
      });
      setName('');
      setStartTime('');
      setEndTime('');
      refreshList();
      setSelectedId(tournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleJoin() {
    if (!token) return;
    setError(null);
    try {
      const { tournament } = await tournamentClient.joinTournament(token, joinCode.trim().toUpperCase());
      setJoinCode('');
      refreshList();
      setSelectedId(tournament.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleStart() {
    if (!token || !selectedId) return;
    setError(null);
    try {
      await tournamentClient.startTournament(token, selectedId);
      refreshDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Teacher moderation (chess.com-inspired suggestion #7, TASK.md) -- creator-only, lobby-phase-only, enforced server-side regardless of what this button does. */
  async function handleRemoveParticipant(userId: string) {
    if (!token || !selectedId) return;
    setError(null);
    try {
      await tournamentClient.removeParticipant(token, selectedId, userId);
      refreshDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleReport(match: Match, winnerId: string) {
    if (!token || !selectedId) return;
    setError(null);
    try {
      await tournamentClient.reportResult(token, selectedId, match.round, match.index, winnerId);
      refreshDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePlayMatch(match: Match) {
    if (!token || !selectedId) return;
    setError(null);
    try {
      const { roomId } = await tournamentClient.startMatchRoom(token, selectedId, match.round, match.index);
      onPlayMatch(selectedId, roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(1400px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button
            type="button"
            onClick={() => (selectedId ? setSelectedId(null) : onBackToLobby())}
            style={secondaryButton}
          >
            ← {selectedId ? 'All tournaments' : 'Lobby'}
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Tournaments</h1>
          {onlineCount !== null && (
            <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              {onlineCount} online
            </span>
          )}
        </header>

        {!isOnline && <OfflineBanner />}

        {!reachable && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--danger)' }}>Can't reach the server — tournaments need apps/server running.</p>
          </div>
        )}

        {!token && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 var(--pad-md) 0', color: 'var(--text-secondary)' }}>
              Sign in to create or join a tournament. Brackets and standings are still viewable while signed out.
            </p>
            <button type="button" onClick={onOpenLogin} style={primaryButton}>
              Sign in
            </button>
          </div>
        )}

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        {!selectedId && (
          <>
            {token && (
              <div style={{ display: 'flex', gap: 'var(--gap-lg)', flexWrap: 'wrap' }}>
                <div style={{ ...cardStyle, flex: '1 1 320px' }}>
                  <h2 style={{ margin: '0 0 var(--pad-md) 0', fontSize: 'var(--fs-label)' }}>Create a tournament</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
                    <input style={inputStyle} placeholder="Tournament name" value={name} onChange={(e) => setName(e.target.value)} />
                    <select style={inputStyle} value={variantId} onChange={(e) => setVariantId(e.target.value as VariantId)}>
                      {ALL_VARIANTS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                      Starts (optional)
                      <input type="datetime-local" style={inputStyle} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                      Closes (optional)
                      <input type="datetime-local" style={inputStyle} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </label>
                    <button type="button" onClick={() => void handleCreate()} disabled={!name.trim()} style={primaryButton}>
                      Create
                    </button>
                  </div>
                </div>
                <div style={{ ...cardStyle, flex: '1 1 320px' }}>
                  <h2 style={{ margin: '0 0 var(--pad-md) 0', fontSize: 'var(--fs-label)' }}>Join with a code</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
                    <input
                      style={{ ...inputStyle, textTransform: 'uppercase' }}
                      placeholder="ABC123"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      maxLength={6}
                    />
                    <button type="button" onClick={() => void handleJoin()} disabled={!joinCode.trim()} style={primaryButton}>
                      Join
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 var(--pad-md) 0', fontSize: 'var(--fs-label)' }}>All tournaments</h2>
              {list && list.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>None yet.</p>}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
                {list?.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      style={{ ...secondaryButton, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
                    >
                      <span>
                        {t.name} · {t.participants.length} player{t.participants.length === 1 ? '' : 's'}
                        {formatSchedule(t.startTime, t.endTime) && (
                          <span style={{ color: 'var(--text-muted)' }}> · {formatSchedule(t.startTime, t.endTime)}</span>
                        )}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{t.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {selectedId && detail && token && showAnalytics && (
          <TournamentAnalyticsScreen
            token={token}
            tournamentId={selectedId}
            tournamentName={detail.tournament.name}
            onBack={() => setShowAnalytics(false)}
          />
        )}

        {selectedId && detail && !showAnalytics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--gap-md)' }}>
                <h2 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>{detail.tournament.name}</h2>
                {/* Every status, not just lobby -- unlike Remove-participant/Start below,
                    analytics only gets more useful once games have actually been
                    played, so it isn't gated to the pre-start phase. */}
                {token && detail.tournament.creatorUserId === user?.id && (
                  <button type="button" onClick={() => setShowAnalytics(true)} style={secondaryButton}>
                    📊 Analytics
                  </button>
                )}
              </div>
              <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                Join code <strong>{detail.tournament.joinCode}</strong> · {detail.tournament.participants.length} players ·{' '}
                {detail.tournament.status}
                {formatSchedule(detail.tournament.startTime, detail.tournament.endTime) && (
                  <> · {formatSchedule(detail.tournament.startTime, detail.tournament.endTime)}</>
                )}
              </p>
              {token && detail.tournament.status === 'lobby' && detail.tournament.creatorUserId === user?.id && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-xs, 6px)', marginTop: 'var(--pad-md)' }}>
                    {detail.tournament.participants.map((participantId) => (
                      <div key={participantId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--gap-sm)' }}>
                        <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                          {participantId === detail.tournament.creatorUserId ? `${shortId(participantId)} (you)` : shortId(participantId)}
                        </span>
                        {participantId !== detail.tournament.creatorUserId && (
                          <button
                            type="button"
                            onClick={() => void handleRemoveParticipant(participantId)}
                            style={{ ...secondaryButton, padding: '2px 8px', fontSize: 'var(--fs-micro)', color: 'var(--danger)' }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleStart()}
                    disabled={detail.tournament.participants.length < 2}
                    style={{ ...primaryButton, marginTop: 'var(--pad-md)' }}
                  >
                    Start tournament
                  </button>
                </>
              )}
            </div>

            {detail.tournament.bracket && (
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 var(--pad-md) 0', fontSize: 'var(--fs-label)' }}>Bracket</h3>
                <div style={{ display: 'flex', gap: 'var(--gap-xl)', overflowX: 'auto' }}>
                  {detail.tournament.bracket.rounds.map((round, roundIdx) => (
                    <div key={roundIdx} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)', minWidth: 200 }}>
                      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Round {roundIdx + 1}
                      </span>
                      {round.map((match) => (
                        <div key={match.index} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--pad-sm)' }}>
                          {[match.playerA, match.playerB].map((p, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: 'var(--fs-meta)',
                                fontWeight: match.winner === p ? 700 : 400,
                                color: match.winner === p ? 'var(--accent)' : 'var(--text-secondary)',
                              }}
                            >
                              {playerLabel(p, user)}
                            </div>
                          ))}
                          {!match.winner && match.playerA && match.playerB && token && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'var(--pad-sm)' }}>
                              {(user?.id === match.playerA || user?.id === match.playerB) && (
                                <button
                                  type="button"
                                  onClick={() => void handlePlayMatch(match)}
                                  style={{ ...primaryButton, padding: '2px 6px', fontSize: 'var(--fs-micro)' }}
                                >
                                  Play this match
                                </button>
                              )}
                              <ReportButtons
                                match={{ ...match, playerA: match.playerA, playerB: match.playerB }}
                                user={user}
                                onReport={handleReport}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 var(--pad-md) 0', fontSize: 'var(--fs-label)' }}>Standings</h3>
              {detail.standings.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>Standings appear once the tournament starts.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-meta)' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ fontWeight: 400, padding: '4px 0' }}>Player</th>
                      <th style={{ fontWeight: 400 }}>Wins</th>
                      <th style={{ fontWeight: 400 }}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...detail.standings]
                      .sort((a, b) => b.wins - a.wins)
                      .map((s) => (
                        <tr key={s.participantId}>
                          <td style={{ padding: '4px 0' }}>{playerLabel(s.participantId, user)}</td>
                          <td>{s.wins}</td>
                          <td>{s.isChampion ? '🏆 Champion' : s.eliminatedInRound ? `Eliminated, round ${String(s.eliminatedInRound)}` : '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
