import { createPortal } from 'react-dom';

interface StartConfirmModalProps {
  open: boolean;
  variantName: string;
  /** e.g. "Pass-and-play with a friend" or "vs Kalabasa (Steady)" — the match summary shown while confirming, so the player can back out to the lobby if this isn't the game they meant to start. */
  opponentSummary: string;
  onStart: () => void;
  onBackToLobby: () => void;
}

const primaryButton = {
  background: 'var(--accent)',
  color: 'var(--accent-on)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const secondaryButton = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-secondary)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  cursor: 'pointer',
} as const;

/**
 * A floating panel inside the game screen itself, gating the game clock and board
 * interaction until the player explicitly confirms — entering the screen (from
 * `GameSetupModal`'s "Start game") used to begin the clock immediately, which is a
 * problem for pass-and-play: the second player hasn't even looked at the board yet.
 * Deliberately not built on the generic `Modal` (no backdrop-click or Escape dismiss,
 * no × button) — dismissing it without a real choice would strand the player with a
 * permanently paused game and no way back in, so the only two ways out are the two
 * buttons here.
 */
export function StartConfirmModal({ open, variantName, opponentSummary, onStart, onBackToLobby }: StartConfirmModalProps) {
  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4, 4, 6, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--pad-xl)',
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ready to start"
        style={{
          background: 'var(--surface-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-card)',
          maxWidth: 380,
          width: '100%',
          padding: 'var(--pad-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--gap-lg)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700 }}>Ready to start?</h2>
          <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
            {variantName} · {opponentSummary}
          </p>
          <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
            The game and move clocks start the moment you press Start.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
          <button type="button" onClick={onStart} style={primaryButton}>
            Start game
          </button>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            Back to lobby
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
