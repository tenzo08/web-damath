import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

describe('App', () => {
  it('renders the board with the opening position and no moves yet', () => {
    render(<App />);
    expect(screen.getByRole('grid', { name: 'Damath board' })).toBeInTheDocument();
    expect(screen.getByText('Light to move')).toBeInTheDocument();
    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
  });

  it('selecting a piece then clicking a legal destination plays the move and updates the ledger', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Integer Damath's opening: white has a piece at (2,1) with a legal quiet move to (3,0).
    const origin = screen.getByRole('gridcell', { name: /^b3, /i });
    await user.click(origin);
    expect(origin).toHaveAttribute('aria-selected', 'true');

    const destination = screen.getByRole('gridcell', { name: /^a4, /i });
    await user.click(destination);

    expect(screen.queryByText('No moves yet.')).not.toBeInTheDocument();
    expect(screen.getByText('Dark to move')).toBeInTheDocument();
    expect(destination).toHaveAttribute('aria-label', expect.stringContaining('light'));
  });

  it('switching variants from the rail starts a fresh game', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Integer Damath' }));
    expect(screen.getByRole('heading', { name: 'Integer Damath' })).toBeInTheDocument();
    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
  });
});
