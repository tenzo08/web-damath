import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { DifficultyTier } from '@damath/ai';
import type { Position, VariantId } from '@damath/engine';
import type { PublicGameView } from './room.js';
import { RoomManager } from './rooms.js';
import type { GameStore } from './store.js';

export interface GameSocketOptions {
  gameStore: GameStore;
  queueBotTimeoutMs: number;
  queueBotEnabled: boolean;
  queueBotTier: DifficultyTier;
}

type ClientMessage =
  | { type: 'create_room'; variantId: VariantId }
  | { type: 'join_room'; roomId: string }
  | { type: 'queue'; variantId: VariantId }
  | { type: 'decline_bot' }
  | { type: 'cancel_queue' }
  | { type: 'move'; from: Position; to: Position }
  | { type: 'resign' };

function isPosition(value: unknown): value is Position {
  return typeof value === 'object' && value !== null && typeof (value as Position).row === 'number' && typeof (value as Position).col === 'number';
}

function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null || typeof (raw as { type?: unknown }).type !== 'string') return null;
  const msg = raw as { type: string; [key: string]: unknown };
  switch (msg.type) {
    case 'create_room':
    case 'queue':
      return typeof msg.variantId === 'string' ? (msg as ClientMessage) : null;
    case 'join_room':
      return typeof msg.roomId === 'string' ? (msg as ClientMessage) : null;
    case 'move':
      return isPosition(msg.from) && isPosition(msg.to) ? (msg as ClientMessage) : null;
    case 'decline_bot':
    case 'cancel_queue':
    case 'resign':
      return msg as ClientMessage;
    default:
      return null;
  }
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/**
 * Registers the `/ws` route and builds the `RoomManager` that owns it — constructed
 * together (not passed in) because the manager's `onRoomUpdate`/`onMatched` callbacks
 * need the socket registry defined in this same closure. Returns the manager so tests
 * (and, later, other REST routes like match history) can reach it directly.
 */
export function registerGameSocket(app: FastifyInstance, options: GameSocketOptions): RoomManager {
  const socketsByRoom = new Map<string, Set<WebSocket>>();
  const socketsByUser = new Map<string, Set<WebSocket>>();
  const roomBySocket = new Map<WebSocket, string>();

  function broadcastRoom(view: PublicGameView): void {
    for (const socket of socketsByRoom.get(view.roomId) ?? []) send(socket, { type: 'state', view });
  }

  function sendToUser(userId: string, message: unknown): void {
    for (const socket of socketsByUser.get(userId) ?? []) send(socket, message);
  }

  function subscribeToRoom(socket: WebSocket, roomId: string): void {
    const previous = roomBySocket.get(socket);
    if (previous) socketsByRoom.get(previous)?.delete(socket);
    roomBySocket.set(socket, roomId);
    let sockets = socketsByRoom.get(roomId);
    if (!sockets) {
      sockets = new Set();
      socketsByRoom.set(roomId, sockets);
    }
    sockets.add(socket);
  }

  const roomManager = new RoomManager({
    gameStore: options.gameStore,
    queueBotTimeoutMs: options.queueBotTimeoutMs,
    queueBotEnabled: options.queueBotEnabled,
    queueBotTier: options.queueBotTier,
    onRoomUpdate: broadcastRoom,
    onMatched: (userId, color, view) => {
      // Unlike the `queue` message handler's own synchronous "matched" branch (which
      // subscribes the caller's own socket inline), this fires from a timer or another
      // user's `enqueue` call — nothing else has subscribed this user's socket(s) to
      // the room yet, and without it their next `move`/`resign` would fail with "not
      // in a room".
      for (const socket of socketsByUser.get(userId) ?? []) subscribeToRoom(socket, view.roomId);
      sendToUser(userId, { type: 'matched', color, view });
    },
  });

  app.register(async (scoped) => {
    scoped.get('/ws', { websocket: true }, (socket: WebSocket, request) => {
      const token = (request.query as { token?: string }).token;
      let userId: string;
      try {
        if (!token) throw new Error('missing token');
        const payload = app.jwt.verify<{ sub: string }>(token);
        userId = payload.sub;
      } catch {
        socket.close(4001, 'unauthorized');
        return;
      }

      let sockets = socketsByUser.get(userId);
      if (!sockets) {
        sockets = new Set();
        socketsByUser.set(userId, sockets);
      }
      sockets.add(socket);

      socket.on('message', (raw: Buffer) => {
        void (async () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw.toString());
          } catch {
            send(socket, { type: 'error', message: 'malformed message' });
            return;
          }
          const message = parseClientMessage(parsed);
          if (!message) {
            send(socket, { type: 'error', message: 'unrecognised message' });
            return;
          }

          switch (message.type) {
            case 'create_room': {
              const room = await roomManager.createRoom(message.variantId, userId);
              subscribeToRoom(socket, room.id);
              send(socket, { type: 'room_created', roomId: room.id, view: room.getView() });
              return;
            }
            case 'join_room': {
              const result = await roomManager.joinRoom(message.roomId, userId);
              if (!result.ok) {
                send(socket, { type: 'error', message: result.error });
                return;
              }
              subscribeToRoom(socket, result.room.id);
              // The joiner needs their own color (not derivable from a broadcast alone);
              // everyone in the room, joiner included, gets the actual state from the
              // single `broadcastRoom` below — never two competing state messages.
              send(socket, { type: 'joined', roomId: result.room.id, color: result.color });
              broadcastRoom(result.room.getView());
              return;
            }
            case 'queue': {
              const result = await roomManager.enqueue(userId, message.variantId);
              if (result.status === 'queued') {
                send(socket, { type: 'queued' });
              } else {
                subscribeToRoom(socket, result.room.id);
                send(socket, { type: 'matched', roomId: result.room.id, color: result.color, view: result.room.getView() });
              }
              return;
            }
            case 'decline_bot':
              roomManager.declineBot(userId);
              return;
            case 'cancel_queue':
              roomManager.cancelQueue(userId);
              send(socket, { type: 'queue_cancelled' });
              return;
            case 'move': {
              const roomId = roomBySocket.get(socket);
              if (!roomId) {
                send(socket, { type: 'error', message: 'not in a room' });
                return;
              }
              const outcome = await roomManager.playMove(roomId, userId, message.from, message.to);
              if (outcome.ok) broadcastRoom(outcome.view);
              else send(socket, { type: 'error', message: outcome.error });
              return;
            }
            case 'resign': {
              const roomId = roomBySocket.get(socket);
              if (!roomId) {
                send(socket, { type: 'error', message: 'not in a room' });
                return;
              }
              const outcome = await roomManager.resign(roomId, userId);
              if (outcome.ok) broadcastRoom(outcome.view);
              else send(socket, { type: 'error', message: outcome.error });
              return;
            }
          }
        })();
      });

      socket.on('close', () => {
        socketsByUser.get(userId)?.delete(socket);
        const roomId = roomBySocket.get(socket);
        if (roomId) socketsByRoom.get(roomId)?.delete(socket);
        roomBySocket.delete(socket);
        roomManager.cancelQueue(userId);
      });
    });
  });

  return roomManager;
}
