import type { ReactNode } from 'react';
import type { AuthUser } from '../lib/authClient';
import { useLocale, type Locale } from '../lib/i18n';
import { ProfileButton } from './ProfileButton';
import { useMediaQuery, NARROW_QUERY } from '../hooks/useMediaQuery';

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
        flex: '0 1 260px',
        minWidth: 220,
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
  // Signed in, the profile button (avatar + name + rating + a "Provisional" badge)
  // is wide enough that on a phone-width screen it and the "Damath" title alone can
  // eat the full row, pushing the online count and locale switcher off-screen with no
  // way to reach them (a real horizontal-scroll bug, found by actually rendering this
  // at a real mobile viewport, not just reasoning about the CSS). Below NARROW_QUERY,
  // the header stacks into two rows instead of trying to fit everything on one.
  const narrow = useMediaQuery(NARROW_QUERY);
  return (
    // `<main>` is a column: the header stays pinned at the top (natural for a
    // persistent nav element), and the tagline+card cluster below it centers in
    // whatever space is left — rather than everything packed at the top with a large
    // dead void underneath on any screen taller than the content needs (found by
    // actually rendering this at 1280x900: the old single-column layout left the
    // bottom two-thirds of the viewport empty).
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--gap-xl)' }}>
      {/* A generous soft ceiling (`min()`), not a fixed cap — fills the available viewport
          on any realistic screen instead of leaving large dead margins at 100% zoom, while
          still stopping short of absurd line lengths on an ultrawide monitor. */}
      <header
        style={{
          width: '100%',
          maxWidth: 'min(1600px, 96vw)',
          display: 'flex',
          flexDirection: narrow ? 'column' : 'row',
          alignItems: narrow ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: 'var(--gap-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)', minWidth: 0 }}>
          <ProfileButton user={user} onOpenSettings={onOpenSettings} onSignIn={onSignIn} />
          <h1 style={{ margin: 0, fontSize: 'var(--fs-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>Damath</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)', justifyContent: narrow ? 'space-between' : 'flex-start' }}>
          {onlineCount !== null && (
            <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              {onlineCount} online
            </span>
          )}
          <LocaleSwitcher />
        </div>
      </header>

      <div
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 'min(1600px, 96vw)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--gap-xl)',
        }}
      >
        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 560, textAlign: 'center' }}>{t('lobby.tagline')}</p>

        {/* Wrapping flexbox, not CSS grid — a grid's `justifyContent: center` only
            centers the whole column-track block, not an incomplete last row (found by
            actually rendering seven cards in a four-column grid: the fifth/sixth cards
            sat left-aligned under the first row instead of centered as their own pair,
            reading as more dead space). Flex-wrap centers every row independently, the
            fifth/sixth/seventh cards included. */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
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
