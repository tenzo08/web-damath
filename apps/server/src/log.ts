/**
 * Strips a `token` query-string value from a request URL before it reaches the access
 * log. `game/ws.ts` authenticates the `/ws` handshake via `?token=<jwt>` (the browser
 * WebSocket API can't set a custom header), and Fastify's default request serializer
 * logs the raw URL, query string included — with `logger: true` in production
 * (`index.ts`), every WS connection attempt would otherwise write a live, still-valid
 * JWT into plaintext server logs. Everything else about the URL is left untouched so
 * request logs stay useful for debugging.
 */
export function redactTokenFromUrl(rawUrl: string): string {
  const [path = '', query] = rawUrl.split('?');
  if (!query) return rawUrl;
  const params = new URLSearchParams(query);
  if (!params.has('token')) return rawUrl;
  params.set('token', '[redacted]');
  return `${path}?${params.toString()}`;
}
