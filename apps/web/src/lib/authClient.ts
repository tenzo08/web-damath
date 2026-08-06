import { SERVER_HTTP_URL } from './serverConfig';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** Elo rating (apps/server/src/rating/elo.ts) — starts at 1200, moves after every online game (human or bot) that finishes with a winner or a draw. Local hot-seat play never touches it. */
  rating: number;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}. Is apps/server running?`);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${String(res.status)}).`);
  return data as T;
}

export function signup(email: string, password: string, displayName: string): Promise<AuthSession> {
  return post<AuthSession>('/auth/signup', { email, password, displayName });
}

export function login(email: string, password: string): Promise<AuthSession> {
  return post<AuthSession>('/auth/login', { email, password });
}

export async function me(token: string): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  if (!res.ok) throw new Error('Session expired — sign in again.');
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}
