import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { App } from './App';
import { BOT_NICKNAMES } from './lib/botNicknames';

/**
 * Every game-behavior test needs to get past the lobby first — App now starts there,
 * chess.com-style. "Play a Friend" now opens the same setup step "Play the Computer"
 * already used, instead of starting immediately with whatever variant was selected
 * last — the chip type is chosen up front and locked for the match.
 */
/** Clicks through the in-game "Ready to start?" confirmation (StartConfirmModal) — the clock and board stay inert until this is pressed, distinct from GameSetupModal's own "Start game" (same label, a different dialog by its accessible name). */
async function confirmReady(user: UserEvent) {
  const readyDialog = screen.getByRole('dialog', { name: 'Ready to start' });
  await user.click(within(readyDialog).getByRole('button', { name: 'Start game' }));
}

async function enterFriendGame(user: UserEvent, variantName?: RegExp) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Play a Friend/ }));
  const dialog = screen.getByRole('dialog', { name: 'New game' });
  if (variantName) {
    await user.click(within(dialog).getByRole('button', { name: variantName }));
  }
  await user.click(within(dialog).getByRole('button', { name: 'Start game' }));
  await confirmReady(user);
}

/** "Play the Computer" now opens the setup modal — the player must choose a tier before the game exists at all. */
async function enterComputerGame(user: UserEvent, tier: 'Learner' | 'Steady' | 'Sharp' | 'Tournament' = 'Steady') {
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Play the Computer/ }));
  const dialog = screen.getByRole('dialog', { name: 'New game' });
  await user.click(within(dialog).getByRole('button', { name: new RegExp(`^${tier}`, 'i') }));
  await user.click(within(dialog).getByRole('button', { name: 'Start game' }));
  await confirmReady(user);
}

describe('browser back/forward navigation', () => {
  it('pushes a real history entry when navigating, so the back button returns to the lobby', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(window.location.pathname).toBe('/');

    await user.click(screen.getByRole('button', { name: /^Play Online/ }));
    // findBy*, not getBy*: OnlineGameScreen is code-split.
    expect(await screen.findByRole('heading', { name: 'Play Online' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/online');

    window.history.back();
    // jsdom dispatches `popstate` asynchronously, same as a real browser.
    expect(await screen.findByRole('heading', { name: 'Damath' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('a direct visit to a screen URL (e.g. a refresh) lands on that screen instead of always the lobby', async () => {
    window.history.replaceState(null, '', '/tournaments');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Tournaments' })).toBeInTheDocument();
  });

  it('an unrecognised path falls back to the lobby rather than a blank screen', () => {
    window.history.replaceState(null, '', '/not-a-real-route');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Damath' })).toBeInTheDocument();
  });
});

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
    // findBy*, not getBy*: TutorialModal is code-split (App.tsx), so it loads
    // asynchronously the first time it's opened.
    expect(await screen.findByRole('dialog', { name: 'How to play Damath' })).toBeInTheDocument();
    expect(screen.getByText('1. The board')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Damath' })).toBeInTheDocument();
  });

  it('"Play Online" without signing in prompts for sign-in rather than erroring out', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^Play Online/ }));
    // findBy*, not getBy*: OnlineGameScreen is code-split (App.tsx), so it loads asynchronously.
    expect(await screen.findByRole('heading', { name: 'Play Online' })).toBeInTheDocument();
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
    // Never "Computer (tier)" -- a friendly nickname instead (lib/botNicknames.ts),
    // randomized, but the exact same one shown in both the score panel's label and the
    // opponent status card — two matches by design.
    const nicknamePattern = new RegExp(`^(${BOT_NICKNAMES.join('|')})$`);
    expect(screen.getAllByText(nicknamePattern).length).toBeGreaterThan(0);
    expect(screen.queryByText(/computer/i)).not.toBeInTheDocument();
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
    // Re-queried, not the stale `destination` reference: the board auto-flips to
    // whichever side is on move in friend mode (Dark, now), which reorders the grid's
    // row/col traversal and makes React recreate the reordered cells rather than just
    // reposition them — a real DOM detail, not a test bug, so the assertion below
    // reflects what a user actually sees (the a4 square, wherever it now sits, showing
    // the piece that just moved there) rather than a detached old node.
    expect(screen.getByRole('gridcell', { name: /^a4, /i })).toHaveAttribute('aria-label', expect.stringContaining('light'));
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
    expect(within(dialog).getByText('🏆 Dark wins!')).toBeInTheDocument();
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
    // This particular game was set up via "Play a Friend" (hot-seat), not the computer --
    // "is thinking" only ever appears while blocked on a computer opponent's move.
    expect(screen.queryByText(/is thinking/i)).not.toBeInTheDocument();
  });

  it('the clock panel shows the 20-minute game clock and the 60-second move clock', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    expect(screen.getByRole('region', { name: 'Clock' })).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('auto-flips the board to whichever side is on move, and hides the manual flip button', async () => {
    const user = userEvent.setup();
    await enterFriendGame(user);

    // Not flipped, Light to move: the first grid cell in document order is a8
    // (Board.tsx's own not-flipped row/col order).
    const grid = screen.getByRole('grid', { name: 'Damath board' });
    expect(within(grid).getAllByRole('gridcell')[0]).toHaveAttribute('aria-label', expect.stringMatching(/^a8,/));
    expect(screen.queryByRole('button', { name: 'Flip board' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('gridcell', { name: /^b3, /i }));
    await user.click(screen.getByRole('gridcell', { name: /^a4, /i }));

    // Dark to move now — auto-flipped, so the first cell is h1 instead.
    expect(within(grid).getAllByRole('gridcell')[0]).toHaveAttribute('aria-label', expect.stringMatching(/^h1,/));
  });

  it('gates the clock and board behind a "Ready to start?" confirmation before the match itself', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Play a Friend/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'New game' })).getByRole('button', { name: 'Start game' }));

    // The board exists (so the match summary reads correctly against it), but the
    // clock hasn't started and a click on it does nothing until confirmed.
    const readyDialog = screen.getByRole('dialog', { name: 'Ready to start' });
    expect(within(readyDialog).getByText(/Pass-and-play with a friend/)).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    await user.click(screen.getByRole('gridcell', { name: /^b3, /i }));
    expect(screen.queryByRole('gridcell', { name: /^b3, /i })).not.toHaveAttribute('aria-selected', 'true');

    await confirmReady(user);
    expect(screen.queryByRole('dialog', { name: 'Ready to start' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('gridcell', { name: /^b3, /i }));
    expect(screen.getByRole('gridcell', { name: /^b3, /i })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('playing the computer', () => {
  it('starts with the chosen tier locked in, shown as a read-only status', async () => {
    const user = userEvent.setup();
    await enterComputerGame(user, 'Learner');

    // Never "Computer (tier)" -- a friendly nickname (lib/botNicknames.ts) instead,
    // shown identically in both the score panel's label and the opponent status card.
    const nicknamePattern = new RegExp(`^(${BOT_NICKNAMES.join('|')})$`);
    expect(screen.getAllByText(nicknamePattern).length).toBeGreaterThan(0);
    expect(screen.queryByText(/computer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('keeps the manual "Flip board" button — only friend mode auto-flips', async () => {
    const user = userEvent.setup();
    await enterComputerGame(user, 'Learner');
    expect(screen.getByRole('button', { name: 'Flip board' })).toBeInTheDocument();
  });
});

// Theme/sound settings are now sign-in-gated (no separate signed-out gear button --
// the profile avatar is the only entry point, ProfileButton.tsx) and covered directly
// at the provider level instead: see lib/settings.test.tsx.
