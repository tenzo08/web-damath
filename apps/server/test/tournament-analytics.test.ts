import { describe, expect, it } from 'vitest';
import { applyMove, createGame, legalMoves, operationAt, pieceAt, scoreCapture, WHOLE_DAMATH } from '@damath/engine';
import type { Move, Piece } from '@damath/engine';
import { computeTournamentAnalytics } from '../src/tournament/analytics.js';
import type { PersistedGame } from '../src/game/store.js';

function fakeGame(overrides: Partial<PersistedGame> = {}): PersistedGame {
  const now = new Date().toISOString();
  return {
    id: 'g1',
    variantId: 'whole',
    players: { white: 'alice', black: 'bob' },
    opponentType: 'human',
    botTier: null,
    botNickname: null,
    moveHistory: [],
    status: 'finished',
    resignedBy: null,
    drawnByAgreement: false,
    tournamentMatch: { tournamentId: 't1', round: 1, index: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Plays real legal moves (never a hand-built one) until the first capture happens —
 * Whole Damath's opening has none, so this always needs a few plies. Bounded so a
 * genuine engine regression fails loudly instead of hanging the suite. Returns the
 * real mover `Piece` as it stood *before* the capturing move (not re-derived
 * afterward, since the capture may have promoted it) — analytics.ts's own
 * `scoreCapture` call needs the taker's real value, not a stand-in.
 */
function playUntilFirstCapture(): { moveHistory: Move<number>[]; capturingMove: Move<number>; mover: Piece<number>; moverColor: 'white' | 'black' } {
  let state = createGame(WHOLE_DAMATH);
  const moveHistory: Move<number>[] = [];
  for (let ply = 0; ply < 40; ply++) {
    const moves = legalMoves(state);
    const move = moves[0];
    if (!move) throw new Error('unreachable: this opening never reaches a position with no legal moves this early');
    const mover = pieceAt(state.board, move.from);
    if (!mover) throw new Error('unreachable: legalMoves only ever proposes a move from an occupied square');
    const moverColor = state.turn;
    moveHistory.push(move);
    state = applyMove(state, move, WHOLE_DAMATH, { checkGameOver: false });
    if (move.captures.length > 0) return { moveHistory, capturingMove: move, mover, moverColor };
  }
  throw new Error('unreachable: a 40-ply forced-first-move walk should hit a mandatory capture well before this');
}

describe('computeTournamentAnalytics', () => {
  it('counts games played for each seated participant, ignoring an unfinished game', () => {
    const state = createGame(WHOLE_DAMATH);
    const firstMove = legalMoves(state)[0];
    if (!firstMove) throw new Error('unreachable: the opening position always has legal moves');
    const finished = fakeGame({ moveHistory: [firstMove] });
    const active = fakeGame({ id: 'g2', status: 'active', moveHistory: [firstMove] });

    const result = computeTournamentAnalytics('t1', ['alice', 'bob'], [finished, active], WHOLE_DAMATH);

    const alice = result.participants.find((p) => p.participantId === 'alice');
    if (!alice) throw new Error('unreachable: every requested participantId gets an entry');
    expect(alice.gamesPlayed).toBe(1); // the active game never counts
    expect(alice.operations).toHaveLength(4);
    expect(alice.operations.every((op) => op.capturesMade === 0 && op.capturesSuffered === 0)).toBe(true);
  });

  it('returns a zeroed entry for a participant who never appears in any game, rather than omitting them', () => {
    const result = computeTournamentAnalytics('t1', ['alice', 'ghost'], [fakeGame()], WHOLE_DAMATH);
    const ghost = result.participants.find((p) => p.participantId === 'ghost');
    expect(ghost).toMatchObject({ gamesPlayed: 0 });
    expect(ghost?.operations.every((op) => op.capturesMade === 0 && op.totalValueGained === 0)).toBe(true);
  });

  it("attributes a real capture's points to the capturer and its cost to the captured side, on the right operation", () => {
    const { moveHistory, capturingMove, mover, moverColor } = playUntilFirstCapture();
    const game = fakeGame({ moveHistory });
    const result = computeTournamentAnalytics('t1', ['alice', 'bob'], [game], WHOLE_DAMATH);

    const capturerId = moverColor === 'white' ? 'alice' : 'bob';
    const captureeId = moverColor === 'white' ? 'bob' : 'alice';
    const step = capturingMove.captures[0];
    if (!step) throw new Error('unreachable: capturingMove.captures.length > 0 by construction');
    const operation = operationAt(step.landedAt);
    // The same primitive analytics.ts itself calls, computed independently here as the
    // expected value rather than re-asserting the implementation's own arithmetic back
    // at itself.
    const expectedValue = scoreCapture(mover, step.capturedPiece, operation, WHOLE_DAMATH.arithmetic);

    const capturer = result.participants.find((p) => p.participantId === capturerId);
    const capturee = result.participants.find((p) => p.participantId === captureeId);
    const capturerStat = capturer?.operations.find((op) => op.operation === operation);
    const captureeStat = capturee?.operations.find((op) => op.operation === operation);
    expect(capturerStat?.capturesMade).toBe(1);
    expect(capturerStat?.totalValueGained).toBe(expectedValue);
    expect(captureeStat?.capturesSuffered).toBe(1);
    expect(captureeStat?.totalValueLost).toBe(expectedValue);
  });
});
