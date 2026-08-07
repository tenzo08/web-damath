import { useState } from 'react';
import { Modal } from './Modal';
import { MiniBoard, type MiniArrowSpec, type MiniSquareSpec } from './diagram/MiniBoard';

const VOID: MiniSquareSpec = { playable: false };
function op(o: '+' | '−' | '×' | '÷'): MiniSquareSpec {
  return { operation: o };
}

export interface Step {
  title: string;
  board?: (MiniSquareSpec | null)[][];
  boardLabel?: string;
  /**
   * Every diagram below uses one consistent convention, matching the real board's
   * default (not-flipped) orientation where White starts near the bottom and advances
   * toward the top (`docs/DAMATH_RULES.md` §2.1, `Board.tsx`'s row order): a playable
   * square is one where `(row + col)` is odd (§1.2), and an ordinary move goes toward
   * row 0 of the diagram (the top, i.e. "forward" for White). Diagonal moves always
   * preserve that row+col parity, so every square a piece actually reaches in a
   * diagram is automatically consistent with it -- verified by `TutorialModal.test.tsx`
   * for every step below, not just eyeballed.
   */
  arrows?: readonly MiniArrowSpec[];
  body: string[];
}

/** Exported for TutorialModal.test.tsx -- every board diagram's geometry is checked mechanically there (checkerboard parity, real diagonal move/jump shapes), not just eyeballed. */
export const STEPS: Step[] = [
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
      [{ highlight: 'legal', playable: true }, VOID, { playable: true }, VOID],
      [VOID, { piece: { owner: 'white', label: '4' } }, VOID, { playable: true }],
      [{ playable: true }, VOID, { playable: true }, VOID],
    ],
    boardLabel: "White slides one square diagonally forward, toward the top of the board.",
    arrows: [{ from: { row: 2, col: 1 }, to: { row: 1, col: 0 }, kind: 'move' }],
    body: [
      'An ordinary chip moves one square diagonally, always toward the far side of the board — never sideways, never backward.',
      "The highlighted square is this chip's only legal quiet move — a capture, if one is available anywhere on the board, would override it (next step).",
    ],
  },
  {
    title: '3. Capturing is mandatory',
    board: [
      [VOID, { playable: true }, VOID, { playable: true }],
      [{ playable: true }, VOID, { highlight: 'legal', playable: true }, VOID],
      [VOID, { piece: { owner: 'black', label: '3' } }, VOID, { playable: true }],
      [{ piece: { owner: 'white', label: '4' } }, VOID, { playable: true }, VOID],
    ],
    boardLabel: "White jumps diagonally over Dark's chip, landing on the empty square just beyond it.",
    arrows: [{ from: { row: 3, col: 0 }, to: { row: 1, col: 2 }, kind: 'capture' }],
    body: [
      'If a capture is available, you must take it — a quiet move is not a legal alternative. This is the single most-forgotten rule for new players.',
      'To capture, a chip jumps diagonally over an adjacent enemy chip and lands on the empty square immediately beyond it, removing the captured chip. Unlike an ordinary move, a capture can go in any diagonal direction — forward or backward — even for a chip that isn\'t a Dama yet.',
    ],
  },
  {
    title: '4. Maximal captures and chains',
    board: [
      [VOID, { playable: true }, VOID, { playable: true }, VOID, { highlight: 'legal', badge: '②', playable: true }],
      [{ playable: true }, VOID, { playable: true }, VOID, { piece: { owner: 'black', label: '5' } }, VOID],
      [VOID, { playable: true }, VOID, { highlight: 'last', badge: '①', playable: true }, VOID, { playable: true }],
      [{ playable: true }, VOID, { piece: { owner: 'black', label: '7' } }, VOID, { playable: true }, VOID],
      [VOID, { piece: { owner: 'white', label: '4' }, badge: '⓪' }, VOID, { playable: true }, VOID, { playable: true }],
      [{ playable: true }, VOID, { playable: true }, VOID, { playable: true }, VOID],
    ],
    boardLabel: 'One turn, two jumps: ⓪→① captures the 7, then ①→② captures the 5.',
    arrows: [
      { from: { row: 4, col: 1 }, to: { row: 2, col: 3 }, kind: 'capture' },
      { from: { row: 2, col: 3 }, to: { row: 0, col: 5 }, kind: 'capture' },
    ],
    body: [
      'If a chip can keep capturing from its landing square, it must — a whole chain of jumps counts as a single turn, like the two jumps shown here.',
      "When more than one capture (or chain) is available, you must play the one that takes the most chips. Taking fewer than the maximum isn't legal, even if it looks safer.",
      'Dama-eat-first: a Dama capturing an ordinary chip beats an ordinary chip capturing one, when both are otherwise equally long.',
    ],
  },
  {
    title: '5. Scoring',
    board: [
      [VOID, { playable: true }, VOID, { operation: '×', highlight: 'legal', badge: '=12', playable: true }],
      [{ playable: true }, VOID, { piece: { owner: 'black', label: '3' } }, VOID],
      [VOID, { piece: { owner: 'white', label: '4' } }, VOID, { playable: true }],
      [{ playable: true }, VOID, { playable: true }, VOID],
    ],
    boardLabel: "White's 4 captures Dark's 3 and lands on ×: 4 × 3 = 12 added to White's score.",
    arrows: [{ from: { row: 2, col: 1 }, to: { row: 0, col: 3 }, kind: 'capture' }],
    body: [
      'Capturing scores points using the operation printed on the square the taker lands on — not the square it started from, and not the square it captured.',
      'A Dama capturing an ordinary chip doubles that result, and an ordinary chip capturing a Dama also doubles it; a Dama capturing a Dama quadruples it.',
      'In Whole, Counting, and Integer Damath, a division result truncates toward zero and anything under 1 in magnitude scores 0 — division by zero always scores 0. Fraction, Radical, and Polynomial Damath keep the exact value instead.',
    ],
  },
  {
    title: '6. Promotion to Dama',
    board: [
      [VOID, { highlight: 'legal', badge: 'Dama', playable: true }, VOID, { playable: true }],
      [{ piece: { owner: 'white', label: '9' } }, VOID, { playable: true }, VOID],
      [VOID, { playable: true }, VOID, { piece: { owner: 'white', label: '5', isDama: true } }],
      [{ playable: true }, VOID, { playable: true }, VOID],
    ],
    boardLabel: "White's 9 reaches the far row and promotes — shown as a ring, like the 5 already is.",
    arrows: [{ from: { row: 1, col: 0 }, to: { row: 0, col: 1 }, kind: 'move' }],
    body: [
      "A chip that reaches the opponent's home row promotes to a Dama — shown as a ring around the chip, never a crown.",
      'A Dama moves and captures any distance along a diagonal, like a checkers king, and only promotes by stopping on that row — passing through it mid-chain does not count.',
    ],
  },
  {
    title: '7. Winning',
    body: [
      'The game ends when a player has no chips left, when a player has chips but literally no legal move for any of them ("cornered"), when the same position repeats three times, or when the 20-minute game clock runs out.',
      "There's also a 60-second clock per move — waived while a capture is mandatory, since you shouldn't be penalized for a forced jump. Run out of time on a single move and the game plays a legal move for you automatically, so play never stalls; run out of the full 20 minutes and the game ends immediately.",
      "At the end, each side's final score is their accumulated capture score plus the value of every chip still on the board — Dama chips count double. Highest total wins.",
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
          {/* Always centered, board stacked above the explanation — not side-by-side, which
              left the board flush against the left edge instead of centered. */}
          {step.board && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <MiniBoard rows={step.board} size={260} label={step.boardLabel} arrows={step.arrows} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
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
