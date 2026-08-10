import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { GoogleSignInButton, googleSignInConfigured } from './GoogleSignInButton';
import type { GooglePendingSignup } from '../lib/authClient';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  /** Returns pending-signup details when this Google identity has no account yet -- `null` means it signed straight in. */
  onGoogleAuth: (idToken: string) => Promise<GooglePendingSignup | null>;
  onCompleteGoogleSignup: (pendingToken: string, displayName: string) => Promise<void>;
}

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

/**
 * Google Sign-In is the only way in -- a self-serve email+password form lets anyone
 * claim to be any address, and even an emailed code only proves control of an inbox,
 * not a real identity (KNOWLEDGE.md). This modal is intentionally small: either the
 * Google button signs an existing account straight in, or (brand-new identity) asks
 * for a nickname to finish creating the account.
 */
export function LoginModal({ open, onClose, onGoogleAuth, onCompleteGoogleSignup }: LoginModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googlePending, setGooglePending] = useState<GooglePendingSignup | null>(null);

  function reset() {
    setDisplayName('');
    setError(null);
    setBusy(false);
    setGooglePending(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    setBusy(true);
    try {
      const pending = await onGoogleAuth(idToken);
      if (pending) {
        setGooglePending(pending);
        setDisplayName(pending.suggestedName);
      } else {
        close();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function submitGoogleCompletion(e: FormEvent) {
    e.preventDefault();
    if (!googlePending) return;
    setError(null);
    setBusy(true);
    try {
      await onCompleteGoogleSignup(googlePending.pendingToken, displayName);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const title = googlePending ? 'Finish creating your account' : 'Sign in with Google';

  return (
    <Modal open={open} onClose={close} title={title} width={380}>
      {googlePending ? (
        <form onSubmit={(e) => void submitGoogleCompletion(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Continuing as <strong>{googlePending.email}</strong>. Choose a nickname to finish.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Nickname
            <input
              style={{
                width: '100%',
                padding: 'var(--pad-sm) var(--pad-md)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--surface-raised)',
                color: 'var(--text-primary)',
                fontSize: 'var(--fs-body)',
              }}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={1}
              maxLength={60}
              autoFocus
            />
          </label>
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} style={primaryButtonStyle(busy)}>
            {busy ? 'Working…' : 'Create account'}
          </button>
          <button type="button" onClick={() => setGooglePending(null)} style={linkButtonStyle}>
            ← Back
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Sign in with your Google account. This keeps every account tied to a real, verified identity.
          </p>
          {googleSignInConfigured ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleSignInButton onCredential={(idToken) => void handleGoogleCredential(idToken)} />
            </div>
          ) : (
            <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
              Google sign-in isn't configured on this deployment.
            </p>
          )}
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
