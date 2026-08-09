import { useEffect, useState } from 'react';
import { operationGlyph } from '../lib/notation';
import * as tournamentClient from '../lib/tournamentClient';
import type { OperationStat, ParticipantAnalytics } from '../lib/tournamentClient';

interface TournamentAnalyticsScreenProps {
  token: string;
  tournamentId: string;
  /** Already known to the caller (TournamentScreen's own loaded detail) — avoids a redundant `getTournament` fetch just to show a heading. */
  tournamentName: string;
  onBack: () => void;
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

function average(total: number, count: number): string {
  return count === 0 ? '—' : (total / count).toFixed(1);
}

/** One participant's per-operation breakdown — "which operations a student struggles with," DESIGN.md's own move-ledger doc comment's use case, finally surfaced. Rows sorted so the operation the student is losing the most net value on (captures suffered worth more than captures made) sorts first — the one a teacher most needs to see without hunting for it. */
function ParticipantCard({ participant, displayName }: { participant: ParticipantAnalytics; displayName: string }) {
  const rows = [...participant.operations].sort((a, b) => {
    const netA = a.totalValueGained - a.totalValueLost;
    const netB = b.totalValueGained - b.totalValueLost;
    return netA - netB;
  });
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: 'var(--fs-label)' }}>{displayName}</h3>
      <p style={{ margin: '0 0 var(--pad-md) 0', fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
        {participant.gamesPlayed} game{participant.gamesPlayed === 1 ? '' : 's'} played
      </p>
      {participant.gamesPlayed === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>No finished games yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-meta)' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ fontWeight: 400, padding: '4px 8px 4px 0' }}>Op</th>
              <th style={{ fontWeight: 400, padding: '4px 8px' }}>Captures made</th>
              <th style={{ fontWeight: 400, padding: '4px 8px' }}>Avg gained</th>
              <th style={{ fontWeight: 400, padding: '4px 8px' }}>Captures suffered</th>
              <th style={{ fontWeight: 400, padding: '4px 8px' }}>Avg lost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((op: OperationStat) => (
              <tr key={op.operation}>
                <td style={{ padding: '4px 8px 4px 0', fontWeight: 700, color: 'var(--accent)' }}>{operationGlyph(op.operation)}</td>
                <td style={{ padding: '4px 8px' }}>{op.capturesMade}</td>
                <td style={{ padding: '4px 8px', color: 'var(--success, #4fbf7b)' }}>{average(op.totalValueGained, op.capturesMade)}</td>
                <td style={{ padding: '4px 8px' }}>{op.capturesSuffered}</td>
                <td style={{ padding: '4px 8px', color: 'var(--danger, #e35b5b)' }}>{average(op.totalValueLost, op.capturesSuffered)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Teacher-facing tournament analytics — reachable only by the tournament's own creator
 * (server-enforced, 403 for anyone else), scoped to that one tournament's participants
 * rather than a whole new teacher/student account role: a tournament's join code +
 * roster already *is* this app's classroom concept (TournamentManager's own doc
 * comment already calls tournaments "teacher-created"), so this reuses it instead of
 * building a parallel one.
 */
export function TournamentAnalyticsScreen({ token, tournamentId, tournamentName, onBack }: TournamentAnalyticsScreenProps) {
  const [data, setData] = useState<{ analytics: tournamentClient.TournamentAnalytics; displayNames: Record<string, string | null> } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    tournamentClient
      .getTournamentAnalytics(token, tournamentId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, tournamentId]);

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(1000px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)', flexWrap: 'wrap' }}>
          <button type="button" onClick={onBack} style={secondaryButton}>
            ← {tournamentName}
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>Analytics</h1>
        </header>

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        {!data && !error && <p style={{ margin: 0, color: 'var(--text-muted)' }}>Loading…</p>}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            {data.analytics.participants.map((participant) => (
              <ParticipantCard
                key={participant.participantId}
                participant={participant}
                displayName={data.displayNames[participant.participantId] ?? participant.participantId.slice(0, 8)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
