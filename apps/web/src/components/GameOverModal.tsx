import type { Player, Variant } from '@damath/engine';
import { Modal } from './Modal';
import { playerLabel } from '../lib/notation';

interface GameOverModalProps<V> {
  open: boolean;
  onDismiss: () => void;
  announcement: string;
  variant: Variant<V>;
  finalScores: Record<Player, V> | null;
  /**
   * Pre-computed by the caller, not derived here from `finalScores` alone — a
   * resignation must declare the resigner's opponent the winner even when the score
   * happens to be tied, which a pure score comparison can't express. `null` means an
   * actual draw (or the game isn't over yet).
   */
  winner: Player | null;
  onRematch: () => void;
  onNewGame: () => void;
  onBackToLobby: () => void;
}

const actionButton = (primary: boolean) =>
  ({
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? 'var(--accent-on)' : 'var(--text-secondary)',
    border: primary ? 'none' : '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: 'var(--pad-sm) var(--pad-md)',
    fontWeight: primary ? 700 : 400,
    cursor: 'pointer',
  }) as const;

/** The "better winner announcement" — a dismissible overlay (not just a status-line sentence) with the final score and a way to immediately act on it. */
export function GameOverModal<V>({
  open,
  onDismiss,
  announcement,
  variant,
  finalScores,
  winner,
  onRematch,
  onNewGame,
  onBackToLobby,
}: GameOverModalProps<V>) {
  return (
    <Modal open={open} onClose={onDismiss} title="Game over" width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <p style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--accent)' }}>
          {winner ? `${playerLabel(winner)} wins!` : 'Draw'}
        </p>
        <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>{announcement}</p>

        {finalScores && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(['white', 'black'] as const).map((player) => (
              <div
                key={player}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 'var(--pad-sm) var(--pad-md)',
                  borderRadius: 'var(--radius)',
                  background: winner === player ? 'var(--accent-bg)' : 'transparent',
                }}
              >
                <span style={{ color: winner === player ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {winner === player && '🏆 '}
                  {playerLabel(player)}
                </span>
                <span style={{ fontWeight: 700 }}>{variant.arithmetic.format(finalScores[player])}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
          <button type="button" style={actionButton(true)} onClick={onRematch}>
            Rematch (same settings)
          </button>
          <button type="button" style={actionButton(false)} onClick={onNewGame}>
            New game…
          </button>
          <button type="button" style={actionButton(false)} onClick={onBackToLobby}>
            Back to lobby
          </button>
          <button type="button" style={actionButton(false)} onClick={onDismiss}>
            View final board
          </button>
        </div>
      </div>
    </Modal>
  );
}
