import type { AuthUser } from '../lib/authClient';
import { useLocale } from '../lib/i18n';

interface AuthBarProps {
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** Always visible top-right, like chess.com's own header — account status is never tied to a particular screen. */
export function AuthBar({ user, onSignIn, onSignOut }: AuthBarProps) {
  const { t } = useLocale();
  if (!user) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        style={{
          background: 'var(--accent)',
          color: 'var(--accent-on)',
          border: 'none',
          borderRadius: 'var(--radius)',
          padding: 'var(--pad-sm) var(--pad-md)',
          fontSize: 'var(--fs-meta)',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {t('auth.signIn')}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
      <span
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: 'var(--accent-on)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: user.avatarEmoji ? 'var(--fs-body)' : 'var(--fs-meta)',
          fontWeight: 700,
        }}
      >
        {user.avatarEmoji ?? user.displayName.charAt(0).toUpperCase()}
      </span>
      <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
        {user.displayName}
        <span style={{ color: 'var(--text-muted)' }}> · {user.rating}</span>
      </span>
      <button
        type="button"
        onClick={onSignOut}
        style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: 'var(--fs-micro)', padding: '4px 8px', cursor: 'pointer' }}
      >
        {t('auth.signOut')}
      </button>
    </div>
  );
}
