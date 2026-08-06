import type { ReactNode } from 'react';
import { useMediaQuery, NARROW_QUERY } from '../hooks/useMediaQuery';

interface RailProps {
  onOpenTutorial: () => void;
  /** "Back to lobby" lives in `menuButton` (GameMenu) now — one place for it, not a second standalone icon button with the same accessible name. */
  menuButton: ReactNode;
}

/**
 * Below `NARROW_QUERY` (900px), a persistent 232px sidebar leaves too little room for
 * the board itself — confirmed by driving the app at real mobile/tablet viewports,
 * where it forced horizontal overflow. Collapses to a slim horizontal top bar instead;
 * same controls, different arrangement, via `useMediaQuery` rather than a CSS-only
 * breakpoint, since the two layouts are structurally different (column vs. row), not
 * just resized.
 *
 * No variant switcher here anymore — it used to let a click swap the chip type mid-game,
 * bypassing `GameSetupModal` entirely and contradicting the rule that the variant (like
 * the AI tier) is locked in for the match once chosen. Changing it now only happens
 * through the Menu button's "New game", which already goes through the setup modal.
 */
export function Rail({ onOpenTutorial, menuButton }: RailProps) {
  const narrow = useMediaQuery(NARROW_QUERY);

  const tutorialButton = (
    <button
      type="button"
      onClick={onOpenTutorial}
      style={{
        width: narrow ? undefined : '100%',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--pad-sm) var(--pad-md)',
        fontSize: 'var(--fs-label)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: narrow ? 'flex-start' : 'center',
        gap: 'var(--gap-sm)',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">❓</span> {narrow ? '' : 'How to play'}
    </button>
  );

  if (narrow) {
    return (
      <nav
        aria-label="Match settings"
        style={{
          width: '100%',
          background: 'var(--surface-rail)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--gap-sm)',
          padding: 'var(--pad-sm) var(--pad-md)',
        }}
      >
        <div style={{ fontSize: 'var(--fs-label)', fontWeight: 700 }}>Damath</div>
        <div style={{ flex: 1 }} />
        {menuButton}
        {tutorialButton}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Match settings"
      style={{
        width: 'var(--rail-width)',
        flexShrink: 0,
        background: 'var(--surface-rail)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--pad-lg) var(--pad-md)',
        gap: 'var(--gap-sm)',
      }}
    >
      <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 'var(--pad-sm)' }}>Damath</div>

      {/* Menu (primary, accent) and How to play (secondary, outlined) — same full width,
          grouped together, instead of mismatched widths stacked with no clear relation. */}
      {menuButton}
      {tutorialButton}

      <div style={{ marginTop: 'auto', fontSize: 'var(--fs-meta)', color: 'var(--text-disabled)' }}>[BUILD: 0.1.0]</div>
    </nav>
  );
}
