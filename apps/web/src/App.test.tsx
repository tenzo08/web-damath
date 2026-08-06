import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { App } from './App';

/** Every game-behavior test needs to get past the lobby first — App now starts there, chess.com-style. */
async function enterFriendGame(user: UserEvent) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Play a Friend/ }));
}

async function openVariantMenu(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: /^Whole Damath/ }));
}

describe('the lobby', () => {
  it('is the landing screen, with mode cards and no board', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Damath' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Play a Friend/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Play the Computer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Play Online/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Learn to Play/ })).toBeInTheDocument();
    expect(screen.queryByRole('grid', { name: 'Damath board' })).not.toBeInTheDocument();
  });

  it('"Learn to Play" opens the tutorial without leaving the lobby', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^Learn to Play/ }));
    expect(screen.getByRole('dialog', { name: 'How to play Damath' })).toBeInTheDocument();
    expect(screen.getByText('1. The board')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Damath' })).toBeInTheDocument();
  });

  it('"Play Online" without signing in prompts for sign-in rather than erroring out', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^Play Online/ }));
    expect(screen.getByRole('heading', { name: 'Play Online' })).toBeInTheDocument();
    expect(screen.getByText(/Sign in to find a real opponent/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '← Lobby' }));
    expect(screen.getByRole('heading', { name: 'Damath' })).toBeInTheDocument();
  });
});

describe('local play (Play a Friend)', () => {
  it('renders the board with the opening position and no moves yet', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);
    expect(screen.getByRole('grid', { name: 'Damath board' })).toBeInTheDocument();
    expect(screen.getByText('Light to move')).toBeInTheDocument();
    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
  });

  it('selecting a piece then clicking a legal destination plays the move and updates the ledger', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    // Whole Damath's opening: white has a piece at (2,1) with a legal quiet move to (3,0).
    const origin = screen.getByRole('gridcell', { name: /^b3, /i });
    await user.click(origin);
    expect(origin).toHaveAttribute('aria-selected', 'true');

    const destination = screen.getByRole('gridcell', { name: /^a4, /i });
    await user.click(destination);

    expect(screen.queryByText('No moves yet.')).not.toBeInTheDocument();
    expect(screen.getByText('Dark to move')).toBeInTheDocument();
    expect(destination).toHaveAttribute('aria-label', expect.stringContaining('light'));
  });

  it('the hamburger variant menu switches variants and starts a fresh game', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await openVariantMenu(user);
    await user.click(screen.getByRole('button', { name: /^Integer Damath/ }));
    expect(screen.getByRole('heading', { name: 'Integer Damath' })).toBeInTheDocument();
    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
    // The menu closes itself after a selection.
    expect(screen.queryByRole('button', { name: /^Fraction Damath/ })).not.toBeInTheDocument();
  });

  it('"New match" restarts the same variant with a fresh board', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await user.click(screen.getByRole('gridcell', { name: /^b3, /i }));
    await user.click(screen.getByRole('gridcell', { name: /^a4, /i }));
    expect(screen.getByText('Dark to move')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New match' }));
    expect(screen.getByRole('heading', { name: 'Whole Damath' })).toBeInTheDocument();
    expect(screen.getByText('Light to move')).toBeInTheDocument();
    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
  });

  it('"Undo move" removes the last move and returns to the previous turn', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await user.click(screen.getByRole('gridcell', { name: /^b3, /i }));
    await user.click(screen.getByRole('gridcell', { name: /^a4, /i }));
    expect(screen.getByText('Dark to move')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo move' }));

    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
    expect(screen.getByText('Light to move')).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /^b3, /i })).toHaveAttribute('aria-label', expect.stringContaining('light'));
  });

  it('"Resign" ends the game in favor of the opponent', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await user.click(screen.getByRole('button', { name: 'Resign' }));

    // Both the visible status line and the visually-hidden aria-live region carry
    // this text, so there are two matches by design.
    expect(screen.getAllByText(/Light resigns\. Dark wins\./)).toHaveLength(2);
  });

  it('stepping back through the move ledger browses history without changing the live game', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await user.click(screen.getByRole('gridcell', { name: /^b3, /i }));
    await user.click(screen.getByRole('gridcell', { name: /^a4, /i }));

    await user.click(screen.getByRole('button', { name: '◂ Back' }));
    expect(screen.getByRole('gridcell', { name: /^b3, /i })).toHaveAttribute('aria-label', expect.stringContaining('light'));
    expect(screen.getByText('Move 0 of 1')).toBeInTheDocument();
    // The live status line is unaffected by browsing history — only the board changes.
    expect(screen.getByText('Dark to move')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByRole('gridcell', { name: /^a4, /i })).toHaveAttribute('aria-label', expect.stringContaining('light'));
  });

  it('a non-integer variant renders formatted (non-numeric) chip values and has no computer opponent', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await openVariantMenu(user);
    await user.click(screen.getByRole('button', { name: /^Fraction Damath/ }));
    expect(screen.getByRole('heading', { name: 'Fraction Damath' })).toBeInTheDocument();
    // Fraction Damath's opening values include "1" (10/10) and fractions like "7/10".
    expect(screen.getByRole('gridcell', { name: /light 7\/10/i })).toBeInTheDocument();
    // No interactive "play the computer" control for this variant — just the explanatory note.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/computer opponent plays Whole, Counting, and Integer Damath only/i)).toBeInTheDocument();
  });

  it('the clock panel shows the 20-minute game clock and the 60-second move clock', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    expect(screen.getByRole('region', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('"Play the Computer" from the lobby starts the game with the opponent already enabled', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Play the Computer/ }));

    expect(screen.getByRole('checkbox', { name: /play the computer/i })).toBeChecked();
  });
});
