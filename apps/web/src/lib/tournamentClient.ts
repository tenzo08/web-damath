import type { VariantId } from '@damath/engine';
import { SERVER_HTTP_URL } from './serverConfig';

export interface Match {
  round: number;
  index: number;
  playerA: string | null;
  playerB: string | null;
  winner: string | null;
}

export interface Bracket {
  participantIds: string[];
  rounds: Match[][];
}

export interface Tournament {
  id: string;
  name: string;
  variantId: VariantId;
  creatorUserId: string;
  joinCode: string;
  participants: string[];
  bracket: Bracket | null;
  status: 'lobby' | 'in_progress' | 'complete';
  createdAt: string;
  updatedAt: string;
}

export interface Standing {
  participantId: string;
  wins: number;
  eliminatedInRound: number | null;
  isChampion: boolean;
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}${path}`, {
      ...init,
      // Only set Content-Type when there's actually a body — Fastify's default JSON
      // body parser tries to parse an empty body as JSON when Content-Type says to,
      // and rejects it with a 400 before the route handler ever runs.
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${String(res.status)}).`);
  return data as T;
}

export function listTournaments(): Promise<{ tournaments: Tournament[] }> {
  return fetch(`${SERVER_HTTP_URL}/tournaments`).then((r) => r.json() as Promise<{ tournaments: Tournament[] }>);
}

export function getTournament(id: string): Promise<{ tournament: Tournament; standings: Standing[] }> {
  return fetch(`${SERVER_HTTP_URL}/tournaments/${id}`).then(
    (r) => r.json() as Promise<{ tournament: Tournament; standings: Standing[] }>,
  );
}

export function createTournament(token: string, name: string, variantId: VariantId): Promise<{ tournament: Tournament }> {
  return call('/tournaments', token, { method: 'POST', body: JSON.stringify({ name, variantId }) });
}

export function joinTournament(token: string, code: string): Promise<{ tournament: Tournament }> {
  return call(`/tournaments/join/${code}`, token, { method: 'POST' });
}

export function startTournament(token: string, id: string): Promise<{ tournament: Tournament }> {
  return call(`/tournaments/${id}/start`, token, { method: 'POST' });
}

export function reportResult(token: string, id: string, round: number, index: number, winnerId: string): Promise<{ tournament: Tournament }> {
  return call(`/tournaments/${id}/matches/${String(round)}/${String(index)}/result`, token, {
    method: 'POST',
    body: JSON.stringify({ winnerId }),
  });
}

/** Creates (or, on a repeat call, returns) the game room for a specific bracket match — playing it through to completion auto-reports the result, no manual "X won" click needed. */
export function startMatchRoom(token: string, id: string, round: number, index: number): Promise<{ roomId: string }> {
  return call(`/tournaments/${id}/matches/${String(round)}/${String(index)}/room`, token, { method: 'POST' });
}
