import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { App } from './App';

/**
 * Every game-behavior test needs to get past the lobby first — App now starts there,
 * chess.com-style. "Play a Friend" now opens the same setup step "Play the Computer"
 * already used, instead of starting immediately with whatever variant was selected
 * last — the chip type is chosen up front and locked for the match.
 */
async function enterFriendGame(user: UserEvent, variantName?: RegExp) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Play a Friend/ }));
  const dialog = screen.getByRole('dialog', { name: 'New game' });
  if (variantName) {
    await user.click(within(dialog).getByRole('button', { name: variantName }));
  }
  await user.click(within(dialog).getByRole('button', { name: 'Start game' }));
}

/** "Play the Computer" now opens the setup modal — the player must choose a tier before the game exists at all. */
async function enterComputerGame(user: UserEvent, tier: 'Learner' | 'Steady' | 'Sharp' | 'Tournament' = 'Steady') {
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Play the Computer/ }));
  const dialog = screen.getByRole('dialog', { name: 'New game' });
  await user.click(within(dialog).getByRole('button', { name: new RegExp(`^${tier}`, 'i') }));
  await user.click(within(dialog).getByRole('button', { name: 'Start game' }));
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

  it('the locale switcher translates the lobby into Filipino and back, persisting the choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('button', { name: /^Play a Friend/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch language to FIL' }));

    expect(screen.getByRole('button', { name: /^Laro Kasama ang Kaibigan/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play a Friend/ })).not.toBeInTheDocument();
    expect(localStorage.getItem('damath.locale')).toBe('fil');

    await user.click(screen.getByRole('button', { name: 'Switch language to EN' }));
    expect(screen.getByRole('button', { name: /^Play a Friend/ })).toBeInTheDocument();
  });

  it('"Play the Computer" opens a setup step — the player must choose a difficulty before the game starts', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Play the Computer/ }));

    const dialog = screen.getByRole('dialog', { name: 'New game' });
    expect(within(dialog).getByRole('button', { name: /^learner/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^tournament/i })).toBeInTheDocument();
    // Reached via the dedicated "Play the Computer" card — the redundant "friend" choice
    // (there's already a separate button for that) isn't offered here.
    expect(within(dialog).queryByRole('button', { name: /Friend \(pass and play\)/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '🤖 Computer' })).not.toBeInTheDocument();
    // Not in a game yet — no board until "Start game" is pressed.
    expect(screen.queryByRole('grid', { name: 'Damath board' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^sharp/i }));
    await user.click(within(dialog).getByRole('button', { name: 'Start game' }));

    expect(screen.getByRole('grid', { name: 'Damath board' })).toBeInTheDocument();
    // Shown in both the score panel's label and the opponent status card — two matches by design.
    expect(screen.getAllByText(/Computer \(sharp/).length).toBeGreaterThan(0);
    // The choice is now locked in — no control anywhere lets it change mid-game.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('"Play a Friend" also opens a setup step — the player chooses the chip type before the game starts', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Play a Friend/ }));

    const dialog = screen.getByRole('dialog', { name: 'New game' });
    // Reached via the dedicated "Play a Friend" card — the redundant "computer" choice
    // (there's already a separate button for that) isn't offered here either.
    expect(within(dialog).queryByRole('button', { name: /Friend \(pass and play\)/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '🤖 Computer' })).not.toBeInTheDocument();
    // Not in a game yet — no board until "Start game" is pressed.
    expect(screen.queryByRole('grid', { name: 'Damath board' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^Integer Damath/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Start game' }));

    expect(screen.getByRole('heading', { name: 'Integer Damath' })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Damath board' })).toBeInTheDocument();
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

  it('the Menu button offers Rematch, New game, and Back to lobby', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await user.click(screen.getByRole('gridcell', { name: /^b3, /i }));
    await user.click(screen.getByRole('gridcell', { name: /^a4, /i }));
    expect(screen.getByText('Dark to move')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: /^Rematch/ }));

    expect(screen.getByRole('heading', { name: 'Whole Damath' })).toBeInTheDocument();
    expect(screen.getByText('Light to move')).toBeInTheDocument();
    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
  });

  it('Menu > New game reopens the setup step, and Back to lobby returns to the lobby', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: /^New game/ }));
    expect(screen.getByRole('dialog', { name: 'New game' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('button', { name: /^Back to lobby/ }));
    expect(screen.getByRole('heading', { name: 'Damath' })).toBeInTheDocument();
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

  it('"Resign" ends the game and shows the winner announcement modal', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    await user.click(screen.getByRole('button', { name: 'Resign' }));

    const dialog = screen.getByRole('dialog', { name: 'Game over' });
    expect(within(dialog).getByText('Dark wins!')).toBeInTheDocument();
    expect(within(dialog).getByText(/Light resigns\. Dark wins\./)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Rematch/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^New game/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Back to lobby' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'View final board' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Damath board' })).toBeInTheDocument();
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

  it('a non-integer variant renders formatted (non-numeric) chip values', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user, /^Fraction Damath/);

    expect(screen.getByRole('heading', { name: 'Fraction Damath' })).toBeInTheDocument();
    // Fraction Damath's opening values include "1" (10/10) and fractions like "7/10".
    expect(screen.getByRole('gridcell', { name: /light 7\/10/i })).toBeInTheDocument();
    // This particular game was set up via "Play a Friend" (hot-seat), not the computer.
    expect(screen.getByText('Local player — pass and play.')).toBeInTheDocument();
  });

  it('the clock panel shows the 20-minute game clock and the 60-second move clock', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    expect(screen.getByRole('region', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });
});

describe('playing the computer', () => {
  it('starts with the chosen tier locked in, shown as a read-only status', async () => {
    const user = userEvent.setup();
    await enterComputerGame(user, 'Learner');

    // Shown in both the score panel's label and the opponent status card — two matches by design.
    expect(screen.getAllByText(/Computer \(learner/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

describe('settings', () => {
  it('opens from the lobby, and switching to Light actually applies the theme to <html> and persists it', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement.dataset.theme).toBeUndefined(); // dark is the default, no attribute needed

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dialog).getByRole('button', { name: /Dark/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /System/ })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Light/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('damath.theme')).toBe('light');

    await user.click(within(dialog).getByRole('button', { name: /Dark/ }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('damath.theme')).toBe('dark');
  });

  it('toggling sound effects off persists the preference', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const soundToggle = within(dialog).getByRole('checkbox');
    expect(soundToggle).toBeChecked(); // on by default

    await user.click(soundToggle);
    expect(soundToggle).not.toBeChecked();
    expect(localStorage.getItem('damath.sound.enabled')).toBe('false');
  });
});
