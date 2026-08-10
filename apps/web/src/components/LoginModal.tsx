import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { GoogleSignInButton, googleSignInConfigured } from './GoogleSignInButton';
import { forgotPassword, type EmailPendingSignup, type GooglePendingSignup } from '../lib/authClient';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  /** Starts a pending signup -- the account doesn't exist yet until the emailed code is redeemed via `onVerifySignupCode`. */
  onSignup: (email: string, password: string, displayName: string) => Promise<EmailPendingSignup>;
  onVerifySignupCode: (pendingToken: string, code: string) => Promise<void>;
  onResendSignupCode: (pendingToken: string) => Promise<EmailPendingSignup>;
  /** Returns pending-signup details when this Google identity has no account yet -- `null` means it signed straight in. */
  onGoogleAuth: (idToken: string) => Promise<GooglePendingSignup | null>;
  onCompleteGoogleSignup: (pendingToken: string, displayName: string, password: string) => Promise<void>;
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

export function LoginModal({
  open,
  onClose,
  onLogin,
  onSignup,
  onVerifySignupCode,
  onResendSignupCode,
  onGoogleAuth,
  onCompleteGoogleSignup,
}: LoginModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [googlePending, setGooglePending] = useState<GooglePendingSignup | null>(null);
  const [emailPending, setEmailPending] = useState<EmailPendingSignup | null>(null);
  const [code, setCode] = useState('');
  const [codeResent, setCodeResent] = useState(false);

  function reset() {
    setMode('login');
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError(null);
    setBusy(false);
    setResetRequested(false);
    setGooglePending(null);
    setEmailPending(null);
    setCode('');
    setCodeResent(false);
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
      else if (mode === 'signup') {
        setEmailPending(await onSignup(email, password, displayName));
        return;
      } else {
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

  async function submitEmailCode(e: FormEvent) {
    e.preventDefault();
    if (!emailPending) return;
    setError(null);
    setBusy(true);
    try {
      await onVerifySignupCode(emailPending.pendingToken, code);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!emailPending) return;
    setError(null);
    setBusy(true);
    try {
      setEmailPending(await onResendSignupCode(emailPending.pendingToken));
      setCode('');
      setCodeResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    setBusy(true);
    try {
      const pending = await onGoogleAuth(idToken);
      if (pending) {
        setGooglePending(pending);
        setDisplayName(pending.suggestedName);
        setPassword('');
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
      await onCompleteGoogleSignup(googlePending.pendingToken, displayName, password);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const title = googlePending
    ? 'Finish creating your account'
    : emailPending
      ? 'Check your email'
      : mode === 'login'
        ? 'Sign in'
        : mode === 'signup'
          ? 'Create an account'
          : 'Reset your password';

  return (
    <Modal open={open} onClose={close} title={title} width={380}>
      {emailPending ? (
        <form onSubmit={(e) => void submitEmailCode(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            We sent a 6-digit code to <strong>{emailPending.email}</strong>. Enter it below to finish creating your account.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Verification code
            <input
              style={inputStyle}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeResent(false);
              }}
              required
              minLength={6}
              maxLength={6}
              inputMode="numeric"
              pattern="\d{6}"
              autoFocus
            />
          </label>
          {codeResent && (
            <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>A new code was sent.</p>
          )}
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} style={primaryButtonStyle(busy)}>
            {busy ? 'Working…' : 'Verify and create account'}
          </button>
          <button type="button" onClick={() => void resendCode()} disabled={busy} style={linkButtonStyle}>
            Resend code
          </button>
          <button type="button" onClick={() => setEmailPending(null)} style={linkButtonStyle}>
            ← Back
          </button>
        </form>
      ) : googlePending ? (
        <form onSubmit={(e) => void submitGoogleCompletion(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Continuing as <strong>{googlePending.email}</strong>. Choose a nickname and a password — the password lets you sign in
            without Google too.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Nickname
            <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={1} maxLength={60} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
            Password
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
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
      ) : mode === 'forgot' && resetRequested ? (
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
          {mode !== 'forgot' && googleSignInConfigured && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <GoogleSignInButton onCredential={(idToken) => void handleGoogleCredential(idToken)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)', color: 'var(--text-muted)', fontSize: 'var(--fs-micro)' }}>
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                or
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            </>
          )}
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
        </form>
      )}
    </Modal>
  );
}
