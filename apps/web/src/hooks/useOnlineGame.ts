import { useCallback, useRef, useState } from 'react';
import type { Player, Position, VariantId } from '@damath/engine';
import { SERVER_WS_URL } from '../lib/serverConfig';
import type { ClientMessage, PublicGameView, ServerMessage } from '../lib/onlineProtocol';

export type OnlineStatus = 'disconnected' | 'connecting' | 'reconnecting' | 'unreachable' | 'idle' | 'queued' | 'in_game';

// Chosen for "a WiFi hiccup or a laptop waking from sleep resumes without the player
// doing anything" — not tuned against a real outage duration, just long enough that a
// handful of quick retries covers a brief drop without hammering the server.
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1500;

/**
 * Thin client for apps/server's /ws game protocol. The server is authoritative — this
 * hook never computes a legal move or a score, it just reflects whatever `state`
 * message arrives (see KNOWLEDGE.md, "online play sends a formatted view, not typed
 * state" — a deliberate simplification: no client-side legal-move highlighting for
 * online games, the server tells you if a move was accepted).
 *
 * Reconnect: an unexpected socket drop mid-game (network blip, laptop sleep) retries
 * the connection on its own and rejoins the same room the moment it's back — the
 * server already supports rejoining a room it already knows the caller as a player in
 * (`rooms.ts`'s `joinRoom` returns the existing seat rather than "room is full"), the
 * client just never exercised that path before. A *deliberate* `disconnect()` (leaving
 * the screen) never triggers a retry.
 */
export function useOnlineGame(token: string | null) {
  const [status, setStatus] = useState<OnlineStatus>('disconnected');
  const [view, setView] = useState<PublicGameView | null>(null);
  const [color, setColor] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const deliberateRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last room this connection was actually seated in — survives an unexpected
  // socket drop (unlike `view`/`color`, which stay too, but this is what drives the
  // rejoin decision explicitly rather than relying on stale render state).
  const lastRoomIdRef = useRef<string | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }, []);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const disconnect = useCallback(() => {
    deliberateRef.current = true;
    clearReconnectTimer();
    lastRoomIdRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    setStatus('disconnected');
    setView(null);
    setColor(null);
  }, []);

  const connect = useCallback(() => {
    if (!token) {
      setStatus('unreachable');
      setError('Sign in first — the multiplayer server authenticates every connection.');
      return;
    }
    deliberateRef.current = false;
    clearReconnectTimer();
    setStatus((current) => (current === 'reconnecting' ? current : 'connecting'));
    setError(null);

    let socket: WebSocket;
    try {
      socket = new WebSocket(`${SERVER_WS_URL}?token=${encodeURIComponent(token)}`);
    } catch {
      setStatus('unreachable');
      setError(`Can't reach the multiplayer server.`);
      return;
    }
    socketRef.current = socket;

    // Every handler below guards on `socketRef.current === socket`: React StrictMode's
    // dev-mode double-invoke (mount → cleanup → remount) opens a socket, closes it
    // before it finishes connecting, then immediately opens a second one — and the
    // first socket's events (especially its delayed `close`) can still fire *after*
    // the second socket has already taken over `socketRef.current`. With no guard, a
    // superseded socket's stale `close` event was clobbering `socketRef.current` back
    // to `null` right after a fresh connection had already succeeded — status still
    // read 'idle' (set by the live socket's `onopen`), but `send()` silently no-opped
    // forever because the ref it reads was null. Found by a real two-browser
    // Playwright session where "Find match" visibly did nothing. The same race can
    // happen outside StrictMode too, any time a reconnect attempt overlaps a slow
    // teardown of the previous socket — the guard is correct in both cases, not a
    // dev-only workaround.
    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      reconnectAttemptsRef.current = 0;
      setStatus('idle');
      setError(null);
      if (lastRoomIdRef.current) {
        send({ type: 'join_room', roomId: lastRoomIdRef.current });
      }
    };
    socket.onerror = () => {
      if (socketRef.current !== socket) return;
      setStatus('unreachable');
      setError(`Can't reach the multiplayer server at ${SERVER_WS_URL} — is apps/server running?`);
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (deliberateRef.current) {
        setStatus('disconnected');
        return;
      }
      if (lastRoomIdRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        setStatus('reconnecting');
        reconnectTimerRef.current = setTimeout(() => connect(), RECONNECT_DELAY_MS);
        return;
      }
      if (lastRoomIdRef.current) {
        setStatus('unreachable');
        setError("Lost connection to the match and couldn't reconnect. Try again.");
        return;
      }
      setStatus((current) => (current === 'unreachable' ? current : 'disconnected'));
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      if (socketRef.current !== socket) return;
      const msg = JSON.parse(event.data) as ServerMessage;
      switch (msg.type) {
        case 'queued':
          setStatus('queued');
          setError(null);
          return;
        case 'queue_cancelled':
          setStatus('idle');
          return;
        case 'matched':
          lastRoomIdRef.current = msg.roomId;
          setColor(msg.color);
          setView(msg.view);
          setStatus('in_game');
          setError(null);
          return;
        case 'joined':
          lastRoomIdRef.current = msg.roomId;
          setColor(msg.color);
          return;
        case 'room_created':
          lastRoomIdRef.current = msg.roomId;
          setView(msg.view);
          setColor('white');
          setStatus('in_game');
          setError(null);
          return;
        case 'state':
          lastRoomIdRef.current = msg.view.roomId;
          setView(msg.view);
          setStatus('in_game');
          return;
        case 'error':
          setError(msg.message);
          return;
      }
    };
  }, [token, send]);

  const queue = useCallback((variantId: VariantId) => send({ type: 'queue', variantId }), [send]);
  const cancelQueue = useCallback(() => send({ type: 'cancel_queue' }), [send]);
  const declineBot = useCallback(() => send({ type: 'decline_bot' }), [send]);
  const move = useCallback((from: Position, to: Position) => send({ type: 'move', from, to }), [send]);
  const resign = useCallback(() => send({ type: 'resign' }), [send]);
  const joinRoom = useCallback((roomId: string) => send({ type: 'join_room', roomId }), [send]);

  return { status, view, color, error, connect, disconnect, queue, cancelQueue, declineBot, move, resign, joinRoom };
}
