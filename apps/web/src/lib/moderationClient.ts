import { SERVER_HTTP_URL } from './serverConfig';

export interface BlockedEntry {
  userId: string;
  displayName: string | null;
  createdAt: string;
}

async function request(path: string, token: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_HTTP_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
  } catch {
    throw new Error(`Can't reach the server at ${SERVER_HTTP_URL}.`);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${String(res.status)}).`);
  }
  return res;
}

export async function reportUser(token: string, reportedUserId: string, reason: string, roomId?: string): Promise<void> {
  await request('/reports', token, { method: 'POST', body: JSON.stringify({ reportedUserId, reason, roomId: roomId ?? null }) });
}

export async function blockUser(token: string, blockedUserId: string): Promise<void> {
  await request('/blocks', token, { method: 'POST', body: JSON.stringify({ blockedUserId }) });
}

export async function unblockUser(token: string, blockedUserId: string): Promise<void> {
  await request(`/blocks/${blockedUserId}`, token, { method: 'DELETE' });
}

export async function myBlocks(token: string): Promise<BlockedEntry[]> {
  const res = await request('/blocks/mine', token, { method: 'GET' });
  const data = (await res.json()) as { blocked: BlockedEntry[] };
  return data.blocked;
}
