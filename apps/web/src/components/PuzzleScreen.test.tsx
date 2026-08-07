import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { PUZZLE_VARIANTS, dailySeed } from '../lib/puzzles';
import { SettingsProvider } from '../lib/settings';
import { PuzzleScreen } from './PuzzleScreen';

function renderPuzzleScreen() {
  render(
    <SettingsProvider>
      <PuzzleScreen onBackToLobby={() => {}} />
    </SettingsProvider>,
  );
}

/**
 * Regression coverage for a real crash found while extending puzzle generation to
 * every variant (`docs/VARIANTS.md`), not just the three `number`-typed ones: the
 * "Generate a new puzzle" variant dropdown must offer all seven, and switching to a
 * structurally different chip type (e.g. Polynomial's array-of-terms values) must
 * never crash, including mid-switch when the board still shows a previous puzzle's
 * differently-shaped pieces for one render.
 */
describe('PuzzleScreen', () => {
  it('offers all seven official variants to generate from', () => {
    renderPuzzleScreen();
    const select = screen.getByLabelText('Variant') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues.sort()).toEqual(PUZZLE_VARIANTS.map((v) => v.id).sort());
    expect(optionValues).toHaveLength(7);
  });

  it('generates and renders a puzzle for every variant without crashing', () => {
    renderPuzzleScreen();
    const select = screen.getByLabelText('Variant') as HTMLSelectElement;
    for (const variant of PUZZLE_VARIANTS) {
      fireEvent.change(select, { target: { value: variant.id } });
      fireEvent.click(screen.getByText('Generate new puzzle'));
    }
  });

  it('switching straight from a number-typed puzzle to a structurally different one (e.g. Polynomial) does not crash', () => {
    // The exact shape of the bug this guards: `state` (the board being shown) and
    // `puzzle.variant` (which formatter renders it) used to update on two different
    // renders, so for one frame a numeric puzzle's board was rendered with a
    // Polynomial/Radical formatter expecting array-shaped chip values.
    renderPuzzleScreen();
    const select = screen.getByLabelText('Variant') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'whole' } });
    fireEvent.click(screen.getByText('Generate new puzzle'));
    fireEvent.change(select, { target: { value: 'polynomial' } });
    fireEvent.click(screen.getByText('Generate new puzzle'));
    fireEvent.change(select, { target: { value: 'radical' } });
    fireEvent.click(screen.getByText('Generate new puzzle'));
  });

  it('shows which player is to move and how many moves the puzzle takes to solve', () => {
    renderPuzzleScreen();
    // Puzzle 1 ("Find the forced chain") is Dark to move after its three setup plies,
    // and its solution is a two-jump capture chain — still one turn (docs/DAMATH_RULES.md:
    // "a whole chain of jumps counts as a single turn"), called out separately rather
    // than counted as extra moves.
    expect(screen.getByText('Dark to move')).toBeInTheDocument();
    expect(screen.getByText(/1 move — a 2-jump capture/)).toBeInTheDocument();
  });

  it('shows a plain "1 move to solve" for a puzzle whose solution is a single jump', () => {
    renderPuzzleScreen();
    // Puzzle 2 ("Pick the better capture") is a single-jump capture.
    fireEvent.click(screen.getByRole('button', { name: 'Next puzzle ▸' }));
    expect(screen.getByText('1 move to solve')).toBeInTheDocument();
  });
});

describe("PuzzleScreen's daily puzzle", () => {
  // Must match PuzzleScreen.tsx's own DAILY_SOLVED_KEY — not exported, since it's an
  // internal implementation detail nothing else needs, but the tests below drive it
  // through localStorage directly to check the "already solved" UI without needing to
  // actually play through a real capture sequence via MiniBoard's unlabelled squares.
  const DAILY_SOLVED_KEY = 'damath.dailyPuzzle.solved';

  beforeEach(() => {
    localStorage.clear();
  });

  it('"Today\'s Puzzle" switches to a puzzle dated today, distinct from the curated set', () => {
    renderPuzzleScreen();
    fireEvent.click(screen.getByRole('button', { name: /Today's Puzzle/ }));
    expect(screen.getByText(/Today's Puzzle ·/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back to curated puzzles' })).toBeInTheDocument();
  });

  it('shows "already solved" once the day\'s puzzle id is marked solved in localStorage', () => {
    localStorage.setItem(DAILY_SOLVED_KEY, `daily-${String(dailySeed(new Date()))}`);
    renderPuzzleScreen();
    expect(screen.getByRole('button', { name: /Today's Puzzle ✓/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Today's Puzzle/ }));
    expect(screen.getByText(/already solved today/)).toBeInTheDocument();
  });

  it('does not show "already solved" for a stale (different-day) localStorage entry', () => {
    localStorage.setItem(DAILY_SOLVED_KEY, 'daily-20200101');
    renderPuzzleScreen();
    expect(screen.queryByRole('button', { name: /Today's Puzzle ✓/ })).not.toBeInTheDocument();
  });
});
