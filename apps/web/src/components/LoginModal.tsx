import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { SERVER_HTTP_URL } from '../lib/serverConfig';
import { forgotPassword } from '../lib/authClient';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, displayName: string) => Promise<void>;
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

const primaryButtonStyle = (busy: boolean) =>
  ({
    background: 'var(--accent)',
    color: 'var(--accent-on)',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: 'var(--pad-sm) var(--pad-md)',
    fontWeight: 700,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
  }) as const;

const linkButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: 'var(--fs-meta)',
  cursor: 'pointer',
} as const;

type Mode = 'login' | 'signup' | 'forgot';

export function LoginModal({ open, onClose, onLogin, onSignup }: LoginModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);

  function reset() {
    setMode('login');
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError(null);
    setBusy(false);
    setResetRequested(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await onLogin(email, password);
      else if (mode === 'signup') await onSignup(email, password, displayName);
      else {
        await forgotPassword(email);
        setResetRequested(true);
        return;
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create an account' : 'Reset your password';

  return (
    <Modal open={open} onClose={close} title={title} width={380}>
      {mode === 'forgot' && resetRequested ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            If an account exists for <strong>{email}</strong>, a reset link has been issued. Ask whoever runs the server to check its
            logs for it — this build doesn't send real email yet.
          </p>
          <button type="button" onClick={() => setMode('login')} style={linkButtonStyle}>
            ← Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
          {mode === 'signup' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
              Display name
              <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={1} maxLength={60} />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Email
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {mode !== 'forgot' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
              Password
              <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </label>
          )}

          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} style={primaryButtonStyle(busy)}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>

          {mode === 'login' && (
            <button type="button" onClick={() => setMode('forgot')} style={linkButtonStyle}>
              Forgot your password?
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'signup' ? 'login' : 'signup'));
              setError(null);
            }}
            style={linkButtonStyle}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>

          {mode === 'forgot' && (
            <button type="button" onClick={() => setMode('login')} style={linkButtonStyle}>
              ← Back to sign in
            </button>
          )}

          <p style={{ margin: 0, fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>
            Signing in is only needed for online multiplayer and match history — local play never requires it. Talks to{' '}
            <code>{SERVER_HTTP_URL}</code>.
          </p>
        </form>
      )}
    </Modal>
  );
}
