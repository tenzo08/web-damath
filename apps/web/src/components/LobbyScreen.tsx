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
  /** How many users are currently connected — `null` while signed out or still connecting (App.tsx's `useLiveUpdates`). */
  onlineCount: number | null;
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
  onlineCount,
}: LobbyScreenProps) {
  const { t } = useLocale();
  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      {/* A generous soft ceiling (`min()`), not a fixed cap — fills the available viewport
          on any realistic screen instead of leaving large dead margins at 100% zoom, while
          still stopping short of absurd line lengths on an ultrawide monitor. */}
      <div style={{ width: '100%', maxWidth: 'min(1600px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-xl)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--gap-md)' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>Damath</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
            {onlineCount !== null && (
              <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                {onlineCount} online
              </span>
            )}
            <LocaleSwitcher />
            <AuthBar user={user} onSignIn={onSignIn} onSignOut={onSignOut} />
          </div>
        </header>

        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 560 }}>{t('lobby.tagline')}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--gap-lg)' }}>
          <ModeCard icon="👥" title={t('lobby.playFriend.title')} description={t('lobby.playFriend.description')} onClick={onPlayFriend} />
          <ModeCard icon="🤖" title={t('lobby.playComputer.title')} description={t('lobby.playComputer.description')} onClick={onPlayComputer} />
          <ModeCard icon="🌐" title={t('lobby.playOnline.title')} description={t('lobby.playOnline.description')} onClick={onPlayOnline} />
          <ModeCard icon="🎓" title={t('lobby.learn.title')} description={t('lobby.learn.description')} onClick={onLearn} />
          <ModeCard icon="🏆" title={t('lobby.tournaments.title')} description={t('lobby.tournaments.description')} onClick={onTournaments} />
        </div>
      </div>
    </main>
  );
}
