import { useCallback, useRef, useState } from 'react';
import type { Player, Position, VariantId } from '@damath/engine';
import { SERVER_WS_URL } from '../lib/serverConfig';
import type { ClientMessage, PublicGameView, ServerMessage } from '../lib/onlineProtocol';

export type OnlineStatus = 'disconnected' | 'connecting' | 'unreachable' | 'idle' | 'queued' | 'in_game';

/**
 * Thin client for apps/server's /ws game protocol. The server is authoritative — this
 * hook never computes a legal move or a score, it just reflects whatever `state`
 * message arrives (see KNOWLEDGE.md, "online play sends a formatted view, not typed
 * state" — a deliberate simplification: no client-side legal-move highlighting for
 * online games, the server tells you if a move was accepted).
 */
export function useOnlineGame(token: string | null) {
  const [status, setStatus] = useState<OnlineStatus>('disconnected');
  const [view, setView] = useState<PublicGameView | null>(null);
  const [color, setColor] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }, []);

  const disconnect = useCallback(() => {
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
    setStatus('connecting');
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

    socket.onopen = () => {
      setStatus('idle');
      setError(null);
    };
    socket.onerror = () => {
      setStatus('unreachable');
      setError(`Can't reach the multiplayer server at ${SERVER_WS_URL} — is apps/server running?`);
    };
    socket.onclose = () => {
      setStatus((current) => (current === 'unreachable' ? current : 'disconnected'));
    };
    socket.onmessage = (event: MessageEvent<string>) => {
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
          setColor(msg.color);
          setView(msg.view);
          setStatus('in_game');
          setError(null);
          return;
        case 'joined':
          setColor(msg.color);
          return;
        case 'room_created':
          setView(msg.view);
          setColor('white');
          setStatus('in_game');
          setError(null);
          return;
        case 'state':
          setView(msg.view);
          setStatus('in_game');
          return;
        case 'error':
          setError(msg.message);
          return;
      }
    };
  }, [token]);

  const queue = useCallback((variantId: VariantId) => send({ type: 'queue', variantId }), [send]);
  const cancelQueue = useCallback(() => send({ type: 'cancel_queue' }), [send]);
  const declineBot = useCallback(() => send({ type: 'decline_bot' }), [send]);
  const move = useCallback((from: Position, to: Position) => send({ type: 'move', from, to }), [send]);
  const resign = useCallback(() => send({ type: 'resign' }), [send]);

  return { status, view, color, error, connect, disconnect, queue, cancelQueue, declineBot, move, resign };
}
