import { useEffect, useState } from 'react';
import { SERVER_WS_URL } from '../lib/serverConfig';
import type { ServerMessage } from '../lib/onlineProtocol';

// Same tuning as useOnlineGame.ts's reconnect: a handful of quick retries covers a
// brief drop without hammering the server if it's genuinely down.
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1500;

/**
 * A second, independent `/ws` connection from `useOnlineGame`'s — deliberately not
 * shared, since a signed-in user might be sitting on the lobby or tournaments screen
 * without ever opening a game. Powers the online-user count and live tournament
 * updates. `ws.ts`'s server side treats every socket for a user identically regardless
 * of which hook opened it (`socketsByUser`), so having two connections open at once
 * when both are active is a real but small inefficiency, not a correctness problem —
 * simpler than threading one shared connection through both hooks for this app's scale.
 *
 * Deliberately doesn't hand back the actual list of changed tournaments — it's a
 * monotonic bump counter instead (`tournamentEventCount`), and callers re-run their
 * existing REST fetch (`tournamentClient.ts`'s `listTournaments`/`getTournament`) when
 * it changes. That reuses the one already-tested source of truth for tournament data
 * instead of duplicating it client-side from two different channels.
 *
 * Reconnects on an unexpected drop (network blip, server restart) instead of leaving
 * `onlineCount` stuck at `null` forever — the online count is meant to stay live for as
 * long as the user is signed in, not just until the first hiccup (found missing while
 * verifying `useOnlineGame`'s reconnect fix elsewhere; this hook had the identical gap).
 */
export function useLiveUpdates(token: string | null) {
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [tournamentEventCount, setTournamentEventCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setOnlineCount(null);
      return;
    }

    let deliberate = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    function connect() {
      let s: WebSocket;
      try {
        s = new WebSocket(`${SERVER_WS_URL}?token=${encodeURIComponent(token as string)}`);
      } catch {
        return;
      }
      socket = s;

      s.onopen = () => {
        if (socket !== s) return;
        reconnectAttempts = 0;
      };
      s.onmessage = (event: MessageEvent<string>) => {
        if (socket !== s) return;
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === 'online_count') setOnlineCount(msg.count);
        else if (msg.type === 'tournament_updated') setTournamentEventCount((n) => n + 1);
      };
      s.onclose = () => {
        if (socket !== s) return;
        socket = null;
        if (deliberate) return;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts += 1;
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
          return;
        }
        // Genuinely given up — reflect that nothing live is known anymore, same as the
        // original behavior, rather than showing a stale count forever.
        setOnlineCount(null);
      };
    }

    connect();

    return () => {
      deliberate = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    };
  }, [token]);

  return { onlineCount, tournamentEventCount };
}
