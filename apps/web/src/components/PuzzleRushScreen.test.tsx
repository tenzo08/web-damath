import { describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { SettingsProvider } from '../lib/settings';
import { PuzzleRushScreen } from './PuzzleRushScreen';

function renderRush() {
  render(
    <SettingsProvider>
      <PuzzleRushScreen onBackToPuzzles={() => {}} />
    </SettingsProvider>,
  );
}

describe('PuzzleRushScreen', () => {
  it('shows the setup step with duration/variant pickers before starting', () => {
    renderRush();
    expect(screen.getByLabelText('Duration')).toBeInTheDocument();
    expect(screen.getByLabelText('Variant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('starting the run generates a puzzle and shows the live timer and score', () => {
    renderRush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText(/Score: 0/)).toBeInTheDocument();
    expect(screen.getByText('60s')).toBeInTheDocument();
  });

  it('offers both the 60-second and 3-minute durations', () => {
    renderRush();
    const select = screen.getByLabelText('Duration') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['60', '180']);
  });
});
