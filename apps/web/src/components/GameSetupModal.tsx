import { useEffect, useState } from 'react';
import { ALL_VARIANTS } from '@damath/engine';
import type { AnyVariant } from '@damath/engine';
import { TIERS } from '@damath/ai';
import type { DifficultyTier } from '@damath/ai';
import { Modal } from './Modal';
import { asIntegerVariant } from '../lib/integer-variant';

export type OpponentChoice = { kind: 'friend' } | { kind: 'computer'; tier: DifficultyTier };

interface GameSetupModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (variant: AnyVariant, opponent: OpponentChoice) => void;
  initialVariant: AnyVariant;
  initialOpponent: OpponentChoice;
}

const TIER_ORDER: readonly DifficultyTier[] = ['learner', 'steady', 'sharp', 'tournament'];
const TIER_DESCRIPTION: Record<DifficultyTier, string> = {
  learner: 'Shallow search, occasional deliberate mistakes — good for a first game.',
  steady: 'A solid, fair opponent for regular play.',
  sharp: 'Plays few mistakes and looks well ahead.',
  tournament: 'Full-strength search, no blunders.',
};

const ELEMENTARY_IDS = new Set(['counting', 'whole', 'fraction']);
const AI_SUPPORTED_IDS = new Set(['whole', 'counting', 'integer']);

const cardButton = (active: boolean) =>
  ({
    textAlign: 'left' as const,
    padding: 'var(--pad-md)',
    borderRadius: 'var(--radius)',
    border: active ? '1px solid rgba(227, 179, 65, 0.5)' : '1px solid var(--border)',
    background: active ? 'var(--accent-bg)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    cursor: 'pointer',
  }) as const;

/**
 * The one place opponent (and, for a computer opponent, difficulty) gets decided —
 * "when starting a new game with an AI the player has to choose the option it wants."
 * Reached from the lobby's "Play the Computer" card and from the in-game menu's
 * "New game" action; never surfaced mid-game, which is what makes the choice durable
 * for that match (see OpponentStatus, the read-only display shown once playing).
 */
export function GameSetupModal({ open, onClose, onConfirm, initialVariant, initialOpponent }: GameSetupModalProps) {
  const [opponentKind, setOpponentKind] = useState<'friend' | 'computer'>(initialOpponent.kind);
  const [tier, setTier] = useState<DifficultyTier>(initialOpponent.kind === 'computer' ? initialOpponent.tier : 'steady');
  const [variant, setVariant] = useState<AnyVariant>(initialVariant);

  useEffect(() => {
    if (!open) return;
    setOpponentKind(initialOpponent.kind);
    setTier(initialOpponent.kind === 'computer' ? initialOpponent.tier : 'steady');
    setVariant(initialVariant);
  }, [open, initialOpponent, initialVariant]);

  useEffect(() => {
    if (opponentKind === 'computer' && !asIntegerVariant(variant)) {
      const fallback = ALL_VARIANTS.find((v) => v.id === 'integer');
      if (fallback) setVariant(fallback);
    }
  }, [opponentKind, variant]);

  const availableVariants = opponentKind === 'computer' ? ALL_VARIANTS.filter((v) => AI_SUPPORTED_IDS.has(v.id)) : ALL_VARIANTS;
  const elementary = availableVariants.filter((v) => ELEMENTARY_IDS.has(v.id));
  const secondary = availableVariants.filter((v) => !ELEMENTARY_IDS.has(v.id));

  function confirm() {
    onConfirm(variant, opponentKind === 'friend' ? { kind: 'friend' } : { kind: 'computer', tier });
  }

  return (
    <Modal open={open} onClose={onClose} title="New game" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <div>
          <h3 style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Opponent</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-sm)' }}>
            <button type="button" style={cardButton(opponentKind === 'friend')} onClick={() => setOpponentKind('friend')}>
              👥 Friend (pass and play)
            </button>
            <button type="button" style={cardButton(opponentKind === 'computer')} onClick={() => setOpponentKind('computer')}>
              🤖 Computer
            </button>
          </div>
        </div>

        {opponentKind === 'computer' && (
          <div>
            <h3 style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Difficulty</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
              {TIER_ORDER.map((candidate) => (
                <button key={candidate} type="button" style={cardButton(tier === candidate)} onClick={() => setTier(candidate)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-body)', textTransform: 'capitalize' }}>
                    <span>{candidate}</span>
                    <span style={{ color: 'var(--text-muted)' }}>depth {TIERS[candidate].maxDepth}</span>
                  </div>
                  <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', marginTop: 2 }}>{TIER_DESCRIPTION[candidate]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Variant</h3>
          {opponentKind === 'computer' && (
            <p style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>
              The computer plays Whole, Counting, and Integer Damath only (docs/AI_OPPONENT.md §4).
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)', maxHeight: 220, overflowY: 'auto' }}>
            {elementary.length > 0 && (
              <div>
                <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Elementary</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {elementary.map((v) => (
                    <button key={v.id} type="button" style={{ ...cardButton(variant.id === v.id), padding: '4px 10px' }} onClick={() => setVariant(v)}>
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {secondary.length > 0 && (
              <div>
                <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Secondary</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {secondary.map((v) => (
                    <button key={v.id} type="button" style={{ ...cardButton(variant.id === v.id), padding: '4px 10px' }} onClick={() => setVariant(v)}>
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={confirm}
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-on)',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: 'var(--pad-sm) var(--pad-lg)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Start game
        </button>
      </div>
    </Modal>
  );
}
