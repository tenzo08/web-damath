import type { ReactNode } from 'react';
import type { AuthUser } from '../lib/authClient';
import { useLocale, type Locale } from '../lib/i18n';
import { AuthBar } from './AuthBar';

interface LobbyScreenProps {
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onPlayFriend: () => void;
  onPlayComputer: () => void;
  onPlayOnline: () => void;
  onLearn: () => void;
  onTournaments: () => void;
  /** `null` when signed out — the card is omitted entirely rather than shown disabled, same reasoning as `ProfileStrip`. */
  onMatchHistory: (() => void) | null;
  /** `null` when signed out, same reasoning as `onMatchHistory`. */
  onSpectate: (() => void) | null;
  /** How many users are currently connected — `null` while signed out or still connecting (App.tsx's `useLiveUpdates`). */
  onlineCount: number | null;
  onOpenSettings: () => void;
}

function ModeCard({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: 'var(--surface-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-xl)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gap-sm)',
        minHeight: 160,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 'var(--fs-display)' }}>
        {icon}
      </span>
      <span style={{ fontSize: 'var(--fs-title)', fontWeight: 700 }}>{title}</span>
      <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</span>
    </button>
  );
}

const LOCALE_LABEL: Record<Locale, string> = { en: 'EN', fil: 'FIL' };

function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();
  const other: Locale = locale === 'en' ? 'fil' : 'en';
  return (
    <button
      type="button"
      onClick={() => setLocale(other)}
      aria-label={`Switch language to ${LOCALE_LABEL[other]}`}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--fs-micro)',
        fontWeight: 700,
        padding: '4px 8px',
        cursor: 'pointer',
      }}
    >
      {LOCALE_LABEL[locale]}
    </button>
  );
}

/** A single-glance identity card — avatar, name, and rating — shown once, centered, above the mode grid. Distinct from `AuthBar` (which stays in the header purely for sign in/out): this is the "show my rank" surface, so it's sized and placed to actually be noticed rather than buried in small header text. */
function ProfileStrip({ user }: { user: AuthUser }) {
  return (
    <div
      style={{
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--gap-md)',
        background: 'var(--surface-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-md) var(--pad-lg)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: 'var(--accent-on)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: user.avatarEmoji ? 22 : 'var(--fs-title)',
          fontWeight: 700,
        }}
      >
        {user.avatarEmoji ?? user.displayName.charAt(0).toUpperCase()}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{user.displayName}</span>
        <span
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--accent)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span aria-hidden="true">🏅</span> Rating {user.rating}
        </span>
      </div>
    </div>
  );
}

/** The landing screen — chess.com-style mode selection instead of dropping straight into a board. */
export function LobbyScreen({
  user,
  onSignIn,
  onSignOut,
  onPlayFriend,
  onPlayComputer,
  onPlayOnline,
  onLearn,
  onTournaments,
  onMatchHistory,
  onSpectate,
  onlineCount,
  onOpenSettings,
}: LobbyScreenProps) {
  const { t } = useLocale();
  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      {/* A generous soft ceiling (`min()`), not a fixed cap — fills the available viewport
          on any realistic screen instead of leaving large dead margins at 100% zoom, while
          still stopping short of absurd line lengths on an ultrawide monitor. */}
      <div style={{ width: '100%', maxWidth: 'min(1600px, 96vw)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--gap-xl)' }}>
        <header style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--gap-md)' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>Damath</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
            {onlineCount !== null && (
              <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                {onlineCount} online
              </span>
            )}
            <LocaleSwitcher />
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Settings"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--fs-body)',
                padding: '4px 8px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              <span aria-hidden="true">⚙️</span>
            </button>
            <AuthBar user={user} onSignIn={onSignIn} onSignOut={onSignOut} />
          </div>
        </header>

        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 560, textAlign: 'center' }}>{t('lobby.tagline')}</p>

        {user && <ProfileStrip user={user} />}

        {/* A fixed card width (not `1fr`) plus a centered grid — on a wide screen the
            cards form a tidy, evenly-sized cluster in the middle instead of stretching
            edge-to-edge just because the viewport happens to be wide. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 260px))',
            justifyContent: 'center',
            gap: 'var(--gap-lg)',
            width: '100%',
          }}
        >
          <ModeCard icon="👥" title={t('lobby.playFriend.title')} description={t('lobby.playFriend.description')} onClick={onPlayFriend} />
          <ModeCard icon="🤖" title={t('lobby.playComputer.title')} description={t('lobby.playComputer.description')} onClick={onPlayComputer} />
          <ModeCard icon="🌐" title={t('lobby.playOnline.title')} description={t('lobby.playOnline.description')} onClick={onPlayOnline} />
          <ModeCard icon="🎓" title={t('lobby.learn.title')} description={t('lobby.learn.description')} onClick={onLearn} />
          <ModeCard icon="🏆" title={t('lobby.tournaments.title')} description={t('lobby.tournaments.description')} onClick={onTournaments} />
          {onMatchHistory && (
            <ModeCard icon="📜" title={t('lobby.matchHistory.title')} description={t('lobby.matchHistory.description')} onClick={onMatchHistory} />
          )}
          {onSpectate && <ModeCard icon="👀" title={t('lobby.spectate.title')} description={t('lobby.spectate.description')} onClick={onSpectate} />}
        </div>
      </div>
    </main>
  );
}
