import type { ReactNode } from 'react';
import type { AuthUser } from '../lib/authClient';
import { AuthBar } from './AuthBar';

interface LobbyScreenProps {
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onPlayFriend: () => void;
  onPlayComputer: () => void;
  onPlayOnline: () => void;
  onLearn: () => void;
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

/** The landing screen — chess.com-style mode selection instead of dropping straight into a board. */
export function LobbyScreen({ user, onSignIn, onSignOut, onPlayFriend, onPlayComputer, onPlayOnline, onLearn }: LobbyScreenProps) {
  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 'var(--gap-xl)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>Damath</h1>
          <AuthBar user={user} onSignIn={onSignIn} onSignOut={onSignOut} />
        </header>

        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 560 }}>
          The Filipino educational board game — Dama plus Mathematics. Capture is mandatory, scoring runs through the
          landing square's operation, and reaching the far row promotes a chip to a Dama.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--gap-lg)' }}>
          <ModeCard icon="👥" title="Play a Friend" description="Local, pass-and-play — two players, one board, any variant." onClick={onPlayFriend} />
          <ModeCard
            icon="🤖"
            title="Play the Computer"
            description="Minimax with four difficulty tiers — Whole, Counting, and Integer Damath."
            onClick={onPlayComputer}
          />
          <ModeCard
            icon="🌐"
            title="Play Online"
            description="Matched with a real opponent, or a labelled computer if no one's waiting."
            onClick={onPlayOnline}
          />
          <ModeCard icon="🎓" title="Learn to Play" description="An interactive, illustrated walkthrough of every rule." onClick={onLearn} />
        </div>
      </div>
    </main>
  );
}
