/**
 * Single-elimination bracket generation and advancement — pure data transforms, no I/O,
 * same "pure core, I/O at the edges" shape as `packages/engine` (just for a different
 * domain). `TournamentManager` (manager.ts) is the only caller; everything here is
 * plain functions over plain data so it's trivially unit-testable in isolation.
 */
export interface Match {
  readonly round: number;
  /** Position within the round, 0-indexed — determines which next-round match this feeds into. */
  readonly index: number;
  readonly playerA: string | null;
  readonly playerB: string | null;
  readonly winner: string | null;
}

export interface Bracket {
  readonly participantIds: readonly string[];
  /** `rounds[0]` is the first round; the last round is always exactly one match (the final). */
  readonly rounds: readonly (readonly Match[])[];
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * Byes go to the first `bracketSize - n` participants (arbitrary but deterministic —
 * this MVP doesn't model seed strength, see KNOWLEDGE.md). A bye match has no
 * `playerB` and its `winner` is pre-set to `playerA`, so it advances immediately
 * without anyone reporting a result.
 */
export function generateBracket(participantIds: readonly string[]): Bracket {
  if (participantIds.length < 2) {
    throw new Error('a bracket needs at least 2 participants');
  }
  const n = participantIds.length;
  const bracketSize = nextPowerOfTwo(n);
  const byeCount = bracketSize - n;
  const byePlayers = participantIds.slice(0, byeCount);
  const pairedPlayers = participantIds.slice(byeCount);

  const round1: Match[] = [];
  for (const player of byePlayers) {
    round1.push({ round: 1, index: round1.length, playerA: player, playerB: null, winner: player });
  }
  for (let i = 0; i < pairedPlayers.length; i += 2) {
    const playerA = pairedPlayers[i] ?? null;
    const playerB = pairedPlayers[i + 1] ?? null;
    round1.push({ round: 1, index: round1.length, playerA, playerB, winner: null });
  }

  const rounds: Match[][] = [round1];
  let matchCount = round1.length / 2;
  let round = 2;
  while (matchCount >= 1) {
    const matches: Match[] = [];
    for (let i = 0; i < matchCount; i++) {
      matches.push({ round, index: i, playerA: null, playerB: null, winner: null });
    }
    rounds.push(matches);
    matchCount = matchCount / 2;
    round++;
  }

  return propagateByes({ participantIds, rounds });
}

/** Feeds already-decided bye winners into round 2+ immediately, same propagation `recordResult` uses for a real result. */
function propagateByes(bracket: Bracket): Bracket {
  let next = bracket;
  for (const match of bracket.rounds[0] ?? []) {
    if (match.winner) next = advance(next, match.round, match.index, match.winner);
  }
  return next;
}

function advance(bracket: Bracket, round: number, index: number, winner: string): Bracket {
  const nextRoundMatches = bracket.rounds[round]; // rounds is 0-indexed, `round` is 1-indexed, so bracket.rounds[round] is the next round
  if (!nextRoundMatches) return bracket; // this was the final — nothing to feed into
  const nextIndex = Math.floor(index / 2);
  const feedsPlayerA = index % 2 === 0;
  const rounds = bracket.rounds.map((matches, roundIdx) => {
    if (roundIdx !== round) return matches;
    return matches.map((m) =>
      m.index === nextIndex ? { ...m, playerA: feedsPlayerA ? winner : m.playerA, playerB: feedsPlayerA ? m.playerB : winner } : m,
    );
  });
  return { ...bracket, rounds };
}

export type RecordResultOutcome = { ok: true; bracket: Bracket } | { ok: false; error: string };

/** Records a match's winner and propagates it into the next round. Never mutates `bracket`. */
export function recordResult(bracket: Bracket, round: number, index: number, winner: string): RecordResultOutcome {
  const roundMatches = bracket.rounds[round - 1];
  const match = roundMatches?.[index];
  if (!match) return { ok: false, error: 'no such match' };
  if (match.winner) return { ok: false, error: 'this match already has a result' };
  if (winner !== match.playerA && winner !== match.playerB) return { ok: false, error: 'winner must be one of this match\'s two players' };
  if (!match.playerA || !match.playerB) return { ok: false, error: 'this match is still waiting on a player from an earlier round' };

  const rounds = bracket.rounds.map((matches, roundIdx) =>
    roundIdx === round - 1 ? matches.map((m) => (m.index === index ? { ...m, winner } : m)) : matches,
  );
  return { ok: true, bracket: advance({ ...bracket, rounds }, round, index, winner) };
}

/** The last round's single match's winner, once decided — `null` while the tournament is still in progress. */
export function champion(bracket: Bracket): string | null {
  const finalRound = bracket.rounds.at(-1);
  return finalRound?.[0]?.winner ?? null;
}

export interface Standing {
  readonly participantId: string;
  readonly wins: number;
  readonly eliminatedInRound: number | null;
  readonly isChampion: boolean;
}

/** One row per participant: how many matches they've won, and whether/where they were eliminated. */
export function standings(bracket: Bracket): readonly Standing[] {
  const champ = champion(bracket);
  return bracket.participantIds.map((participantId) => {
    let wins = 0;
    let eliminatedInRound: number | null = null;
    for (const round of bracket.rounds) {
      for (const match of round) {
        const played = match.playerA === participantId || match.playerB === participantId;
        if (!played || !match.winner) continue;
        if (!match.playerA || !match.playerB) continue; // a bye is a walkover, not a competitive result
        if (match.winner === participantId) wins += 1;
        else eliminatedInRound = match.round;
      }
    }
    return { participantId, wins, eliminatedInRound, isChampion: participantId === champ };
  });
}
