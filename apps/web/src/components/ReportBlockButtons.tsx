import { useState } from 'react';
import { Modal } from './Modal';
import { blockUser, reportUser } from '../lib/moderationClient';

interface ReportBlockButtonsProps {
  token: string;
  targetUserId: string;
  targetName: string;
  /** Set when reporting from inside a specific game — omitted from match history, where there's no "current" room. */
  roomId?: string;
}

const smallButton = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-muted)',
  fontSize: 'var(--fs-micro)',
  padding: '4px 8px',
  cursor: 'pointer',
} as const;

/** Report/Block, reachable wherever a real opponent's identity is visible (Play Online, Match History) — the moderation floor for a tool with real accounts (chess.com-inspired suggestion #7, TASK.md). Reports have no review UI yet (no admin/role concept exists in this app); they're still stored durably server-side. */
export function ReportBlockButtons({ token, targetUserId, targetName, roomId }: ReportBlockButtonsProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);

  async function submitReport() {
    setError(null);
    setSubmitting(true);
    try {
      await reportUser(token, targetUserId, reason.trim(), roomId);
      setReportSent(true);
      setTimeout(() => setReportOpen(false), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report.');
    } finally {
      setSubmitting(false);
    }
  }

  async function doBlock() {
    setBlocking(true);
    try {
      await blockUser(token, targetUserId);
      setBlocked(true);
    } catch {
      // Best-effort — a failed block isn't worth interrupting the flow the button was clicked from.
    } finally {
      setBlocking(false);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--gap-xs, 6px)' }}>
        <button type="button" onClick={() => setReportOpen(true)} style={smallButton}>
          Report
        </button>
        <button type="button" onClick={() => void doBlock()} disabled={blocked || blocking} style={smallButton}>
          {blocked ? 'Blocked' : 'Block'}
        </button>
      </div>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={`Report ${targetName}`} width={420}>
        {reportSent ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Report sent. Thanks for letting us know.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
              What happened?
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={4}
                style={{
                  padding: 'var(--pad-sm) var(--pad-md)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-raised)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--fs-body)',
                  resize: 'vertical',
                }}
              />
            </label>
            {error && (
              <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void submitReport()}
              disabled={submitting || reason.trim().length === 0}
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-on)',
                border: 'none',
                borderRadius: 'var(--radius)',
                padding: 'var(--pad-sm) var(--pad-md)',
                fontWeight: 700,
                cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Sending…' : 'Send report'}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
