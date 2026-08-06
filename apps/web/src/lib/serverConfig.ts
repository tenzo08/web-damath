/** apps/server's base URL — configurable so a deployed client can point at a real server; defaults to the local dev server started via `pnpm -F server dev`. */
const rawBase: string = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:3001';

export const SERVER_HTTP_URL = rawBase.replace(/\/$/, '');
export const SERVER_WS_URL = `${SERVER_HTTP_URL.replace(/^http/, 'ws')}/ws`;
