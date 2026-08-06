import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeTestApp, type TestApp } from './helpers.js';

let testApp: TestApp;
let app: FastifyInstance;

beforeEach(() => {
  testApp = makeTestApp();
  app = testApp.app;
});

afterEach(() => testApp.cleanup());

async function signupToken(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email, password: 'a-long-enough-password', displayName: email },
  });
  return (res.json() as { token: string }).token;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('POST /tournaments', () => {
  it('creates a tournament with the creator as its first participant', async () => {
    const token = await signupToken('teacher@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: auth(token),
      payload: { name: 'Grade 7 Damath Cup', variantId: 'integer' },
    });
    expect(res.statusCode).toBe(201);
    const { tournament } = res.json() as { tournament: { joinCode: string; participants: string[]; status: string } };
    expect(tournament.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(tournament.participants).toHaveLength(1);
    expect(tournament.status).toBe('lobby');
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'POST', url: '/tournaments', payload: { name: 'x', variantId: 'integer' } });
    expect(res.statusCode).toBe(401);
  });

  it('persists an optional start/end schedule, display metadata only — not enforced against joining or starting', async () => {
    const token = await signupToken('scheduler@example.com');
    const startTime = '2026-09-01T08:00:00.000Z';
    const endTime = '2026-09-01T17:00:00.000Z';
    const res = await app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: auth(token),
      payload: { name: 'Scheduled Cup', variantId: 'integer', startTime, endTime },
    });
    expect(res.statusCode).toBe(201);
    const { tournament } = res.json() as { tournament: { startTime: string | null; endTime: string | null } };
    expect(tournament.startTime).toBe(startTime);
    expect(tournament.endTime).toBe(endTime);

    const fetched = await app.inject({ method: 'GET', url: `/tournaments/${(res.json() as { tournament: { id: string } }).tournament.id}` });
    expect((fetched.json() as { tournament: { startTime: string } }).tournament.startTime).toBe(startTime);
  });

  it('rejects a malformed schedule timestamp', async () => {
    const token = await signupToken('badschedule@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: auth(token),
      payload: { name: 'x', variantId: 'integer', startTime: 'not-a-date' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('defaults to no schedule when none is given', async () => {
    const token = await signupToken('noschedule@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/tournaments',
      headers: auth(token),
      payload: { name: 'x', variantId: 'integer' },
    });
    const { tournament } = res.json() as { tournament: { startTime: string | null; endTime: string | null } };
    expect(tournament.startTime).toBeNull();
    expect(tournament.endTime).toBeNull();
  });
});

describe('joining and starting', () => {
  async function createTournament(token: string, name = 'Cup') {
    const res = await app.inject({ method: 'POST', url: '/tournaments', headers: auth(token), payload: { name, variantId: 'integer' } });
    return (res.json() as { tournament: { id: string; joinCode: string } }).tournament;
  }

  it('lets other signed-in users join by code, and rejects a bad code', async () => {
    const creatorToken = await signupToken('creator@example.com');
    const tournament = await createTournament(creatorToken);
    const playerToken = await signupToken('player@example.com');

    const join = await app.inject({ method: 'POST', url: `/tournaments/join/${tournament.joinCode}`, headers: auth(playerToken) });
    expect(join.statusCode).toBe(200);
    expect((join.json() as { tournament: { participants: string[] } }).tournament.participants).toHaveLength(2);

    const badCode = await app.inject({ method: 'POST', url: '/tournaments/join/ZZZZZZ', headers: auth(playerToken) });
    expect(badCode.statusCode).toBe(400);
  });

  it('only the creator can start, and only once there are at least 2 participants', async () => {
    const creatorToken = await signupToken('creator2@example.com');
    const tournament = await createTournament(creatorToken);
    const soloStart = await app.inject({ method: 'POST', url: `/tournaments/${tournament.id}/start`, headers: auth(creatorToken) });
    expect(soloStart.statusCode).toBe(400);

    const playerToken = await signupToken('player2@example.com');
    await app.inject({ method: 'POST', url: `/tournaments/join/${tournament.joinCode}`, headers: auth(playerToken) });

    const wrongStarter = await app.inject({ method: 'POST', url: `/tournaments/${tournament.id}/start`, headers: auth(playerToken) });
    expect(wrongStarter.statusCode).toBe(400);

    const start = await app.inject({ method: 'POST', url: `/tournaments/${tournament.id}/start`, headers: auth(creatorToken) });
    expect(start.statusCode).toBe(200);
    const body = start.json() as { tournament: { status: string; bracket: { rounds: unknown[][] } } };
    expect(body.tournament.status).toBe('in_progress');
    expect(body.tournament.bracket.rounds).toHaveLength(1); // 2 participants -> a single final
  });
});

describe('reporting results and standings', () => {
  it('runs a full 4-player bracket to a champion and exposes standings', async () => {
    const creatorToken = await signupToken('c3@example.com');
    const create = await app.inject({ method: 'POST', url: '/tournaments', headers: auth(creatorToken), payload: { name: 'Cup', variantId: 'integer' } });
    const tournament = (create.json() as { tournament: { id: string; joinCode: string } }).tournament;

    const tokens = [creatorToken];
    for (const email of ['p1@example.com', 'p2@example.com', 'p3@example.com']) {
      const token = await signupToken(email);
      await app.inject({ method: 'POST', url: `/tournaments/join/${tournament.joinCode}`, headers: auth(token) });
      tokens.push(token);
    }

    await app.inject({ method: 'POST', url: `/tournaments/${tournament.id}/start`, headers: auth(creatorToken) });
    const started = await app.inject({ method: 'GET', url: `/tournaments/${tournament.id}` });
    type Match = { round: number; index: number; playerA: string | null; playerB: string | null };
    const bracket = (started.json() as { tournament: { bracket: { rounds: Match[][] } } }).tournament.bracket;
    const [m0, m1] = bracket.rounds[0] ?? [];
    if (!m0?.playerA || !m1?.playerA) throw new Error('expected two first-round matches with a playerA');

    const r1 = await app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/0/result`,
      headers: auth(creatorToken),
      payload: { winnerId: m0.playerA },
    });
    expect(r1.statusCode).toBe(200);

    const r2 = await app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/1/result`,
      headers: auth(creatorToken),
      payload: { winnerId: m1.playerA },
    });
    expect(r2.statusCode).toBe(200);

    const finalRes = await app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/2/0/result`,
      headers: auth(creatorToken),
      payload: { winnerId: m0.playerA },
    });
    expect(finalRes.statusCode).toBe(200);
    expect((finalRes.json() as { tournament: { status: string } }).tournament.status).toBe('complete');

    const final = await app.inject({ method: 'GET', url: `/tournaments/${tournament.id}` });
    type StandingRow = { participantId: string; wins: number; isChampion: boolean };
    const { standings } = final.json() as { standings: StandingRow[] };
    const champ = standings.find((s) => s.isChampion);
    expect(champ?.participantId).toBe(m0.playerA);
    expect(champ?.wins).toBe(2);
  });

  it('rejects a result reported by someone who is not a match participant or the creator', async () => {
    const creatorToken = await signupToken('c4@example.com');
    const create = await app.inject({ method: 'POST', url: '/tournaments', headers: auth(creatorToken), payload: { name: 'Cup', variantId: 'integer' } });
    const tournament = (create.json() as { tournament: { id: string; joinCode: string } }).tournament;
    const playerToken = await signupToken('p4@example.com');
    await app.inject({ method: 'POST', url: `/tournaments/join/${tournament.joinCode}`, headers: auth(playerToken) });
    await app.inject({ method: 'POST', url: `/tournaments/${tournament.id}/start`, headers: auth(creatorToken) });

    const bystanderToken = await signupToken('bystander@example.com');
    const res = await app.inject({
      method: 'POST',
      url: `/tournaments/${tournament.id}/matches/1/0/result`,
      headers: auth(bystanderToken),
      payload: { winnerId: 'whoever' },
    });
    expect(res.statusCode).toBe(400);
  });
});
