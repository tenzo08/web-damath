import { useEffect, useState } from 'react';
import { SERVER_WS_URL } from '../lib/serverConfig';
import type { ServerMessage } from '../lib/onlineProtocol';

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
 */
export function useLiveUpdates(token: string | null) {
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [tournamentEventCount, setTournamentEventCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setOnlineCount(null);
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(`${SERVER_WS_URL}?token=${encodeURIComponent(token)}`);
    } catch {
      return;
    }

    socket.onmessage = (event: MessageEvent<string>) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === 'online_count') setOnlineCount(msg.count);
      else if (msg.type === 'tournament_updated') setTournamentEventCount((n) => n + 1);
    };
    socket.onclose = () => setOnlineCount(null);

    return () => socket.close();
  }, [token]);

  return { onlineCount, tournamentEventCount };
}
