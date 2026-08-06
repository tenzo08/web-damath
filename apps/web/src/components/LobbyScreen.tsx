import type { ReactNode } from 'react';
import type { AuthUser } from '../lib/authClient';
import { useLocale, type Locale } from '../lib/i18n';
import { ProfileButton } from './ProfileButton';

interface LobbyScreenProps {
  user: AuthUser | null;
  onSignIn: () => void;
  onPlayFriend: () => void;
  onPlayComputer: () => void;
  onPlayOnline: () => void;
  onLearn: () => void;
  onTournaments: () => void;
  onPuzzles: () => void;
  /** `null` when signed out — the card is omitted entirely rather than shown disabled. */
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

/** The landing screen — chess.com-style mode selection instead of dropping straight into a board. */
export function LobbyScreen({
  user,
  onSignIn,
  onPlayFriend,
  onPlayComputer,
  onPlayOnline,
  onLearn,
  onTournaments,
  onPuzzles,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
            <ProfileButton user={user} onOpenSettings={onOpenSettings} onSignIn={onSignIn} />
            <h1 style={{ margin: 0, fontSize: 'var(--fs-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>Damath</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
            {onlineCount !== null && (
              <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                {onlineCount} online
              </span>
            )}
            <LocaleSwitcher />
          </div>
        </header>

        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 560, textAlign: 'center' }}>{t('lobby.tagline')}</p>

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
          <ModeCard icon="🧩" title={t('lobby.puzzles.title')} description={t('lobby.puzzles.description')} onClick={onPuzzles} />
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
