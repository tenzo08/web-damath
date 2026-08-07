import type { AuthUser } from '../lib/authClient';
import { useLocale } from '../lib/i18n';
import { Avatar } from './Avatar';

interface ProfileButtonProps {
  user: AuthUser | null;
  onOpenSettings: () => void;
  onSignIn: () => void;
}

/**
 * The account entry point, always top-left — no separate gear/Settings button
 * anywhere: signed in, clicking the avatar opens the Profile modal directly (which
 * owns nickname/avatar editing, theme, sound, and sign-out, the last one pinned at the
 * very bottom); signed out, it's just the Sign In CTA.
 */
export function ProfileButton({ user, onOpenSettings, onSignIn }: ProfileButtonProps) {
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
    <button
      type="button"
      onClick={onOpenSettings}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--gap-sm)',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '4px var(--pad-md) 4px 4px',
        cursor: 'pointer',
      }}
    >
      {/* A visually-hidden prefix, not `aria-label` on the button -- an `aria-label`
          replaces the accessible name entirely, which used to drop the visible
          "Rating N"/"Provisional" text from it (axe's label-content-name-mismatch,
          caught by a real Lighthouse audit). Prefixing real (if hidden) text keeps the
          accessible name a superset of everything actually on screen instead. */}
      <span className="visually-hidden">Open profile for </span>
      <Avatar size={32} imageUrl={user.avatarImage} emoji={user.avatarEmoji} fallbackLetter={user.displayName.charAt(0).toUpperCase()} />
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25 }}>
        <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-primary)', fontWeight: 700 }}>{user.displayName}</span>
        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Rating {user.rating}
          {user.placementGamesPlayed < user.placementGamesRequired && (
            <span
              title={`${String(user.placementGamesRequired - user.placementGamesPlayed)} placement game(s) left`}
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                borderRadius: 3,
                padding: '0 3px',
              }}
            >
              Provisional
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
