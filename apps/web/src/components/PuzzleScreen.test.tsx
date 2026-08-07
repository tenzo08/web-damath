import { describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { PUZZLE_VARIANTS } from '../lib/puzzles';
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
});
