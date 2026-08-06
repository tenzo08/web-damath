import { useState } from 'react';
import { Modal } from './Modal';
import { MiniBoard, type MiniSquareSpec } from './diagram/MiniBoard';

const VOID: MiniSquareSpec = { playable: false };
function op(o: '+' | '−' | '×' | '÷'): MiniSquareSpec {
  return { operation: o };
}

interface Step {
  title: string;
  board?: (MiniSquareSpec | null)[][];
  boardLabel?: string;
  body: string[];
}

const STEPS: Step[] = [
  {
    title: '1. The board',
    board: [
      [VOID, op('+'), VOID, op('−')],
      [op('×'), VOID, op('÷'), VOID],
      [VOID, op('−'), VOID, op('+')],
      [op('÷'), VOID, op('×'), VOID],
    ],
    boardLabel: 'Every playable square carries one of the four operations.',
    body: [
      'Damath is played on the dark squares of an 8×8 board, exactly like checkers — except each playable square also prints an operation: +, −, ×, or ÷.',
      'That operation matters the moment a chip lands there — see step 5.',
    ],
  },
  {
    title: '2. Ordinary moves',
    board: [
      [VOID, { playable: true }, VOID, { playable: true }],
      [{ playable: true }, VOID, { playable: true }, VOID],
      [VOID, { piece: { owner: 'white', label: '4' } }, VOID, { playable: true }],
      [{ highlight: 'legal', playable: true }, VOID, { playable: true }, VOID],
    ],
    boardLabel: 'A chip moves one square diagonally forward, onto an empty square.',
    body: [
      'An ordinary chip moves one square diagonally, always toward the far side of the board — never sideways, never backward.',
      'The highlighted square is this chip\'s only legal quiet move — a capture, if one is available anywhere on the board, would override it (next step).',
    ],
  },
  {
    title: '3. Capturing is mandatory',
    board: [
      [VOID, { highlight: 'legal', playable: true }, VOID, { playable: true }],
      [{ playable: true }, VOID, { piece: { owner: 'black', label: '3' } }, VOID],
      [VOID, { piece: { owner: 'white', label: '4' } }, VOID, { playable: true }],
      [{ playable: true }, VOID, { playable: true }, VOID],
    ],
    boardLabel: 'White jumps diagonally over Dark, landing just beyond it.',
    body: [
      'If a capture is available, you must take it — a quiet move is not a legal alternative. This is the single most-forgotten rule for new players.',
      'To capture, a chip jumps diagonally over an adjacent enemy chip and lands on the empty square immediately beyond it. The captured chip is removed from the board.',
    ],
  },
  {
    title: '4. Maximal captures and chains',
    board: [
      [{ playable: true }, VOID, { highlight: 'legal', badge: '2', playable: true }, VOID],
      [VOID, { piece: { owner: 'black', label: '7' } }, VOID, { playable: true }],
      [{ highlight: 'last', badge: '1', playable: true }, VOID, { piece: { owner: 'black', label: '5' } }, VOID],
      [VOID, { piece: { owner: 'white', label: '4' }, badge: '0' }, VOID, { playable: true }],
    ],
    boardLabel: 'One turn, two jumps: land on ①, then continue to ②.',
    body: [
      'If a chip can keep capturing from its landing square, it must — a whole chain of jumps counts as a single turn.',
      "When more than one capture (or chain) is available, you must play the one that takes the most chips. Taking fewer than the maximum isn't legal, even if it looks safer.",
      'A Dama capturing an ordinary chip beats an ordinary chip capturing one, when both are otherwise equally long.',
    ],
  },
  {
    title: '5. Scoring',
    board: [
      [VOID, { piece: { owner: 'white', label: '4' } }, VOID, { playable: true }],
      [{ highlight: 'legal', playable: true }, VOID, op('×'), VOID],
      [VOID, { playable: true }, VOID, { playable: true }],
      [{ playable: true }, VOID, { playable: true }, VOID],
    ],
    boardLabel: 'The taker lands on ×, so 4 × (captured chip\'s value) becomes the score.',
    body: [
      'Capturing scores points using the operation printed on the square the taker lands on — not the square it started from.',
      'A Dama capturing (or being captured) doubles the result; a Dama taking a Dama doubles it twice. Division by zero simply scores 0, and a fractional integer result under 1 in magnitude also scores 0.',
    ],
  },
  {
    title: '6. Promotion to Dama',
    board: [
      [{ highlight: 'legal', playable: true }, VOID, { playable: true }, VOID],
      [VOID, { piece: { owner: 'white', label: '9' } }, VOID, { playable: true }],
      [{ playable: true }, VOID, { playable: true }, VOID],
      [VOID, { playable: true }, VOID, { playable: true }],
    ],
    boardLabel: 'Reaching the far row promotes an ordinary chip to a Dama (the ring).',
    body: [
      'A chip that reaches the opponent\'s home row promotes to a Dama — shown as a ring around the chip, never a crown.',
      'A Dama moves and captures any distance along a diagonal, like a checkers king, and only promotes by stopping on that row — passing through it mid-chain does not count.',
    ],
  },
  {
    title: '7. Winning',
    body: [
      'The game ends when a player has no chips left, when a player has chips but literally no legal move for any of them ("cornered"), or when the same position repeats three times.',
      'There\'s also a clock: 20 minutes total for the game, and 60 seconds per move (waived while a capture is mandatory — you don\'t get penalized for a forced jump). Run out of time on your move and the game plays a legal move for you automatically, so the game always keeps moving.',
      'At the end, each side\'s final score is their accumulated capture score plus the value of every chip still on the board — Dama chips count double. Highest total wins.',
    ],
  },
];

export function TutorialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  if (!step) return null;

  function close() {
    setIndex(0);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="How to play Damath" width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {step.board && (
            <div style={{ flex: '0 0 auto' }}>
              <MiniBoard rows={step.board} size={200} label={step.boardLabel} />
            </div>
          )}
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-label)', color: 'var(--accent)' }}>{step.title}</h3>
            {step.body.map((p, i) => (
              <p key={i} style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {p}
              </p>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 'var(--pad-md)' }}>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            style={navButtonStyle(index === 0)}
          >
            ◂ Previous
          </button>
          <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
            {index + 1} of {STEPS.length}
          </span>
          {index < STEPS.length - 1 ? (
            <button type="button" onClick={() => setIndex((i) => Math.min(STEPS.length - 1, i + 1))} style={navButtonStyle(false)}>
              Next ▸
            </button>
          ) : (
            <button type="button" onClick={close} style={{ ...navButtonStyle(false), color: 'var(--accent)' }}>
              Done
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function navButtonStyle(disabled: boolean) {
  return {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
    padding: 'var(--pad-sm) var(--pad-md)',
    fontSize: 'var(--fs-meta)',
    cursor: disabled ? 'default' : 'pointer',
  } as const;
}
