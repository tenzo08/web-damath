import { describe, expect, it } from 'vitest';
import { champion, generateBracket, recordResult, standings } from '../src/tournament/bracket.js';

describe('generateBracket', () => {
  it('rejects fewer than 2 participants', () => {
    expect(() => generateBracket(['solo'])).toThrow();
  });

  it('pairs a power-of-two field with no byes', () => {
    const bracket = generateBracket(['a', 'b', 'c', 'd']);
    expect(bracket.rounds).toHaveLength(2); // semifinal, final
    expect(bracket.rounds[0]).toHaveLength(2);
    expect(bracket.rounds[0]?.every((m) => m.playerA && m.playerB && !m.winner)).toBe(true);
  });

  it('gives byes to the first participants for a non-power-of-two field, resolved immediately into round 2', () => {
    // 5 participants -> bracket of 8 -> 3 byes (a, b, c) and one real match (d vs e).
    const bracket = generateBracket(['a', 'b', 'c', 'd', 'e']);
    expect(bracket.rounds[0]).toEqual([
      { round: 1, index: 0, playerA: 'a', playerB: null, winner: 'a' },
      { round: 1, index: 1, playerA: 'b', playerB: null, winner: 'b' },
      { round: 1, index: 2, playerA: 'c', playerB: null, winner: 'c' },
      { round: 1, index: 3, playerA: 'd', playerB: 'e', winner: null },
    ]);
    // Both byes in round 2's first match are already resolved without anyone reporting a result.
    expect(bracket.rounds[1]?.[0]).toMatchObject({ playerA: 'a', playerB: 'b', winner: null });
    // The second round-2 match is waiting on round 1's real match to finish.
    expect(bracket.rounds[1]?.[1]).toMatchObject({ playerA: 'c', playerB: null, winner: null });
    expect(bracket.rounds).toHaveLength(3);
  });
});

describe('recordResult', () => {
  it('advances the winner into the next round at the correct slot', () => {
    let bracket = generateBracket(['a', 'b', 'c', 'd']);
    const first = recordResult(bracket, 1, 0, 'a');
    expect(first.ok).toBe(true);
    if (first.ok) bracket = first.bracket;
    expect(bracket.rounds[1]?.[0]).toMatchObject({ playerA: 'a', playerB: null });

    const second = recordResult(bracket, 1, 1, 'd');
    expect(second.ok).toBe(true);
    if (second.ok) bracket = second.bracket;
    expect(bracket.rounds[1]?.[0]).toMatchObject({ playerA: 'a', playerB: 'd' });

    const final = recordResult(bracket, 2, 0, 'a');
    expect(final.ok).toBe(true);
    if (final.ok) bracket = final.bracket;
    expect(champion(bracket)).toBe('a');
  });

  it('rejects a winner who is not one of the match\'s two players', () => {
    const bracket = generateBracket(['a', 'b', 'c', 'd']);
    expect(recordResult(bracket, 1, 0, 'c')).toEqual({ ok: false, error: "winner must be one of this match's two players" });
  });

  it('rejects reporting a result twice for the same match', () => {
    let bracket = generateBracket(['a', 'b', 'c', 'd']);
    const first = recordResult(bracket, 1, 0, 'a');
    if (first.ok) bracket = first.bracket;
    expect(recordResult(bracket, 1, 0, 'a')).toEqual({ ok: false, error: 'this match already has a result' });
  });

  it('rejects reporting a result for a match still waiting on an earlier round', () => {
    const bracket = generateBracket(['a', 'b', 'c', 'd', 'e']);
    // round 2 match 1 has only playerA ('c') filled in — playerB awaits round 1 match 3.
    expect(recordResult(bracket, 2, 1, 'c')).toEqual({
      ok: false,
      error: 'this match is still waiting on a player from an earlier round',
    });
  });

  it('never mutates the input bracket', () => {
    const bracket = generateBracket(['a', 'b', 'c', 'd']);
    const before = JSON.parse(JSON.stringify(bracket)) as unknown;
    recordResult(bracket, 1, 0, 'a');
    expect(bracket).toEqual(before);
  });
});

describe('champion and standings', () => {
  it('champion is null until the final is decided', () => {
    let bracket = generateBracket(['a', 'b', 'c', 'd']);
    expect(champion(bracket)).toBeNull();
    const r1 = recordResult(bracket, 1, 0, 'a');
    if (r1.ok) bracket = r1.bracket;
    expect(champion(bracket)).toBeNull();
  });

  it('standings track wins and elimination round for every participant', () => {
    let bracket = generateBracket(['a', 'b', 'c', 'd']);
    const r1a = recordResult(bracket, 1, 0, 'a');
    if (r1a.ok) bracket = r1a.bracket;
    const r1b = recordResult(bracket, 1, 1, 'c');
    if (r1b.ok) bracket = r1b.bracket;
    const final = recordResult(bracket, 2, 0, 'a');
    if (final.ok) bracket = final.bracket;

    const table = standings(bracket);
    expect(table).toContainEqual({ participantId: 'a', wins: 2, eliminatedInRound: null, isChampion: true });
    expect(table).toContainEqual({ participantId: 'b', wins: 0, eliminatedInRound: 1, isChampion: false });
    expect(table).toContainEqual({ participantId: 'c', wins: 1, eliminatedInRound: 2, isChampion: false });
    expect(table).toContainEqual({ participantId: 'd', wins: 0, eliminatedInRound: 1, isChampion: false });
  });

  it('a bye counts as neither a win nor a loss for standings purposes', () => {
    const bracket = generateBracket(['a', 'b', 'c', 'd', 'e']);
    const table = standings(bracket);
    // a, b, c all received a first-round bye — no wins recorded for it, not eliminated by it.
    expect(table.find((s) => s.participantId === 'a')).toMatchObject({ wins: 0, eliminatedInRound: null });
  });
});
