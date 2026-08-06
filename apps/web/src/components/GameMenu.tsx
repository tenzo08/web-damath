import { useState } from 'react';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMediaQuery, NARROW_QUERY } from '../hooks/useMediaQuery';

interface GameMenuProps {
  onRematch: () => void;
  onNewGame: () => void;
  onBackToLobby: () => void;
}

/**
 * Replaces the old always-visible "New match" button — one place for "continue, start
 * a new game, or change settings," per the request. "New Game" is the only path back
 * into `GameSetupModal` once a match is underway, which is also how AI settings end up
 * locked mid-game: there's no other control left that could change them.
 */
export function GameMenu({ onRematch, onNewGame, onBackToLobby }: GameMenuProps) {
  const [open, setOpen] = useState(false);
  useEscapeToClose(open, () => setOpen(false));
  // Full width in the wide sidebar (matches Rail's "How to play" button below it, instead
  // of a small pill sitting flush left against a full-width neighbor); auto-width in the
  // narrow top bar, where it sits inline with other controls.
  const narrow = useMediaQuery(NARROW_QUERY);

  const item = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      style={{
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        color: 'var(--text-secondary)',
        fontSize: 'var(--fs-body)',
        padding: 'var(--pad-sm) var(--pad-md)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          width: narrow ? undefined : '100%',
          background: 'var(--accent)',
          color: 'var(--accent-on)',
          border: 'none',
          borderRadius: 'var(--radius)',
          padding: 'var(--pad-sm) var(--pad-md)',
          fontSize: 'var(--fs-label)',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Menu
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: 200,
              zIndex: 20,
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-card)',
              padding: 'var(--pad-sm)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {item('Continue', () => undefined)}
            {item('Rematch (same settings)', onRematch)}
            {item('New game…', onNewGame)}
            {item('Back to lobby', onBackToLobby)}
          </div>
        </>
      )}
    </div>
  );
}
