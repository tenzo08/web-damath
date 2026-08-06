import { randomUUID } from 'node:crypto';
import type { VariantId } from '@damath/engine';
import { champion, generateBracket, recordResult, standings, type Standing } from './bracket.js';
import type { PersistedTournament, TournamentStore } from './store.js';

// No 0/O/1/I — a join code is read aloud in a classroom and typed on a phone keyboard.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomJoinCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export type JoinResult = { ok: true; tournament: PersistedTournament } | { ok: false; error: string };
export type StartResult = { ok: true; tournament: PersistedTournament } | { ok: false; error: string };
export type ReportResult = { ok: true; tournament: PersistedTournament } | { ok: false; error: string };

export interface TournamentManagerOptions {
  /**
   * Fires after every mutation that actually changed a tournament — create, join,
   * start, or a reported result — regardless of which path triggered it. `app.ts` wires
   * this to a WS broadcast so every connected client's tournament list/detail can
   * refresh itself live. A single hook here, rather than a broadcast call at each REST
   * route, is what guarantees the auto-report path (`RoomManager`'s
   * `onTournamentMatchFinished`, which calls `reportResult` directly, never through
   * `routes.ts`) also broadcasts — no call site can forget it.
   */
  onChange?: ((tournament: PersistedTournament) => void) | undefined;
}

/**
 * Teacher-created tournaments with a join code, single-elimination bracket
 * (bracket.ts), and standings.
 */
export class TournamentManager {
  constructor(
    private readonly store: TournamentStore,
    private readonly options: TournamentManagerOptions = {},
  ) {}

  private notify(tournament: PersistedTournament): void {
    this.options.onChange?.(tournament);
  }

  async create(
    name: string,
    variantId: VariantId,
    creatorUserId: string,
    schedule?: { startTime?: string | null | undefined; endTime?: string | null | undefined },
  ): Promise<PersistedTournament> {
    const now = new Date().toISOString();
    const tournament: PersistedTournament = {
      id: randomUUID(),
      name,
      variantId,
      creatorUserId,
      joinCode: randomJoinCode(),
      participants: [creatorUserId],
      bracket: null,
      status: 'lobby',
      startTime: schedule?.startTime ?? null,
      endTime: schedule?.endTime ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.create(tournament);
    this.notify(tournament);
    return tournament;
  }

  async join(joinCode: string, userId: string): Promise<JoinResult> {
    const tournament = await this.store.findByJoinCode(joinCode.toUpperCase());
    if (!tournament) return { ok: false, error: 'no tournament with that join code' };
    if (tournament.status !== 'lobby') return { ok: false, error: 'this tournament has already started' };
    if (tournament.participants.includes(userId)) return { ok: true, tournament };
    const updated: PersistedTournament = {
      ...tournament,
      participants: [...tournament.participants, userId],
      updatedAt: new Date().toISOString(),
    };
    await this.store.update(updated);
    this.notify(updated);
    return { ok: true, tournament: updated };
  }

  async start(id: string, byUserId: string): Promise<StartResult> {
    const tournament = await this.store.findById(id);
    if (!tournament) return { ok: false, error: 'tournament not found' };
    if (tournament.creatorUserId !== byUserId) return { ok: false, error: 'only the tournament creator can start it' };
    if (tournament.status !== 'lobby') return { ok: false, error: 'this tournament has already started' };
    if (tournament.participants.length < 2) return { ok: false, error: 'need at least 2 participants to start' };

    const bracket = generateBracket(tournament.participants);
    const updated: PersistedTournament = { ...tournament, bracket, status: 'in_progress', updatedAt: new Date().toISOString() };
    await this.store.update(updated);
    this.notify(updated);
    return { ok: true, tournament: updated };
  }

  async reportResult(id: string, round: number, index: number, winnerId: string, byUserId: string): Promise<ReportResult> {
    const tournament = await this.store.findById(id);
    if (!tournament) return { ok: false, error: 'tournament not found' };
    if (!tournament.bracket) return { ok: false, error: 'tournament has not started' };
    const match = tournament.bracket.rounds[round - 1]?.[index];
    if (!match) return { ok: false, error: 'no such match' };
    if (byUserId !== match.playerA && byUserId !== match.playerB && byUserId !== tournament.creatorUserId) {
      return { ok: false, error: 'only a match participant or the tournament creator can report this result' };
    }

    const outcome = recordResult(tournament.bracket, round, index, winnerId);
    if (!outcome.ok) return { ok: false, error: outcome.error };

    const complete = champion(outcome.bracket) !== null;
    const updated: PersistedTournament = {
      ...tournament,
      bracket: outcome.bracket,
      status: complete ? 'complete' : tournament.status,
      updatedAt: new Date().toISOString(),
    };
    await this.store.update(updated);
    this.notify(updated);
    return { ok: true, tournament: updated };
  }

  get(id: string): Promise<PersistedTournament | null> {
    return this.store.findById(id);
  }

  list(): Promise<readonly PersistedTournament[]> {
    return this.store.list();
  }

  standingsFor(tournament: PersistedTournament): readonly Standing[] {
    return tournament.bracket ? standings(tournament.bracket) : [];
  }
}
