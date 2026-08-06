import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { resetPassword } from '../lib/authClient';

interface ResetPasswordModalProps {
  token: string;
  onClose: () => void;
}

const inputStyle = {
  width: '100%',
  padding: 'var(--pad-sm) var(--pad-md)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  fontSize: 'var(--fs-body)',
} as const;

/** Opened when the app loads with a `?resetToken=` query param — the "link" a real email would have delivered (App.tsx reads it once on mount and clears it from the URL). */
export function ResetPasswordModal({ token, onClose }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Reset your password" width={380}>
      {done ? (
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Your password has been reset. Sign in with your new password from the button in the top-right corner.
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            New password
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Confirm new password
            <input style={inputStyle} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </label>
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-on)',
              border: 'none',
              borderRadius: 'var(--radius)',
              padding: 'var(--pad-sm) var(--pad-md)',
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Working…' : 'Reset password'}
          </button>
        </form>
      )}
    </Modal>
  );
}
