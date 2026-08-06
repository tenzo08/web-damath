import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { DifficultyTier } from '@damath/ai';
import type { Position, VariantId } from '@damath/engine';
import type { PublicGameView, TournamentMatchRef } from './room.js';
import { RoomManager } from './rooms.js';
import type { GameStore } from './store.js';
import type { UserStore } from '../auth/store.js';

export interface GameSocketOptions {
  gameStore: GameStore;
  /** Forwarded straight into `RoomManager`'s option of the same name — see rooms.ts. */
  userStore: UserStore;
  queueBotTimeoutMs: number;
  queueBotEnabled: boolean;
  queueBotTier: DifficultyTier;
  /** Forwarded straight into `RoomManager`'s option of the same name — see rooms.ts. */
  onTournamentMatchFinished?: (ref: TournamentMatchRef, winnerUserId: string) => Promise<void>;
}

type ClientMessage =
  | { type: 'create_room'; variantId: VariantId }
  | { type: 'join_room'; roomId: string }
  /** Watch a room's broadcasts without taking a seat — rejected if the room doesn't exist, but never assigns a color even if one happens to be open (that's what `join_room` is for). */
  | { type: 'spectate'; roomId: string }
  | { type: 'queue'; variantId: VariantId }
  | { type: 'decline_bot' }
  | { type: 'cancel_queue' }
  | { type: 'move'; from: Position; to: Position }
  | { type: 'resign' }
  | { type: 'offer_draw' }
  | { type: 'respond_draw'; accept: boolean };

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
    case 'spectate':
      return typeof msg.roomId === 'string' ? (msg as ClientMessage) : null;
    case 'move':
      return isPosition(msg.from) && isPosition(msg.to) ? (msg as ClientMessage) : null;
    case 'decline_bot':
    case 'cancel_queue':
    case 'resign':
    case 'offer_draw':
      return msg as ClientMessage;
    case 'respond_draw':
      return typeof msg.accept === 'boolean' ? (msg as ClientMessage) : null;
    default:
      return null;
  }
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/** What `registerGameSocket` hands back — the `RoomManager` most callers want, plus a way to reach every currently-connected socket, for tournament live-update broadcasts and the online-user count. */
export interface GameSocketHandle {
  readonly roomManager: RoomManager;
  broadcastToAll(message: unknown): void;
  onlineUserCount(): number;
}

/**
 * Registers the `/ws` route and builds the `RoomManager` that owns it — constructed
 * together (not passed in) because the manager's `onRoomUpdate`/`onMatched` callbacks
 * need the socket registry defined in this same closure. Returns the manager so tests
 * (and, later, other REST routes like match history) can reach it directly.
 */
export function registerGameSocket(app: FastifyInstance, options: GameSocketOptions): GameSocketHandle {
  const socketsByRoom = new Map<string, Set<WebSocket>>();
  // Every authenticated `/ws` connection lands here regardless of what it's used for
  // (a game room, or just being present) — `.size` is exactly "how many distinct users
  // are currently connected," the basis for the online-user count. A user with several
  // tabs/devices open still counts once, since it's keyed by user id, not by socket.
  const socketsByUser = new Map<string, Set<WebSocket>>();
  const roomBySocket = new Map<WebSocket, string>();

  function broadcastRoom(view: PublicGameView): void {
    for (const socket of socketsByRoom.get(view.roomId) ?? []) send(socket, { type: 'state', view });
  }

  function sendToUser(userId: string, message: unknown): void {
    for (const socket of socketsByUser.get(userId) ?? []) send(socket, message);
  }

  function broadcastToAll(message: unknown): void {
    for (const sockets of socketsByUser.values()) {
      for (const socket of sockets) send(socket, message);
    }
  }

  function broadcastOnlineCount(): void {
    broadcastToAll({ type: 'online_count', count: socketsByUser.size });
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
    userStore: options.userStore,
    queueBotTimeoutMs: options.queueBotTimeoutMs,
    queueBotEnabled: options.queueBotEnabled,
    queueBotTier: options.queueBotTier,
    ...(options.onTournamentMatchFinished ? { onTournamentMatchFinished: options.onTournamentMatchFinished } : {}),
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
      const isNewOnlineUser = !sockets;
      if (!sockets) {
        sockets = new Set();
        socketsByUser.set(userId, sockets);
      }
      sockets.add(socket);
      if (isNewOnlineUser) {
        // The count actually changed — tell everyone, this new socket included (it's
        // already in `socketsByUser` above).
        broadcastOnlineCount();
      } else {
        // Just another tab/device for someone already online — the count didn't change,
        // so no broadcast, but this socket still needs to know the current count rather
        // than wait for some unrelated future connect/close to learn it.
        send(socket, { type: 'online_count', count: socketsByUser.size });
      }

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
            case 'spectate': {
              const room = await roomManager.getRoom(message.roomId);
              if (!room) {
                send(socket, { type: 'error', message: 'room not found' });
                return;
              }
              subscribeToRoom(socket, room.id);
              // Unlike join_room, nothing about the room's own state changed — only this
              // socket needs the current view, not a broadcast to everyone already there.
              send(socket, { type: 'spectating', roomId: room.id, view: room.getView() });
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
            case 'offer_draw': {
              const roomId = roomBySocket.get(socket);
              if (!roomId) {
                send(socket, { type: 'error', message: 'not in a room' });
                return;
              }
              const outcome = await roomManager.offerDraw(roomId, userId);
              if (outcome.ok) broadcastRoom(outcome.view);
              else send(socket, { type: 'error', message: outcome.error });
              return;
            }
            case 'respond_draw': {
              const roomId = roomBySocket.get(socket);
              if (!roomId) {
                send(socket, { type: 'error', message: 'not in a room' });
                return;
              }
              const outcome = await roomManager.respondDraw(roomId, userId, message.accept);
              if (outcome.ok) broadcastRoom(outcome.view);
              else send(socket, { type: 'error', message: outcome.error });
              return;
            }
          }
        })();
      });

      socket.on('close', () => {
        const userSockets = socketsByUser.get(userId);
        userSockets?.delete(socket);
        if (userSockets && userSockets.size === 0) {
          socketsByUser.delete(userId);
          broadcastOnlineCount();
        }
        const roomId = roomBySocket.get(socket);
        if (roomId) socketsByRoom.get(roomId)?.delete(socket);
        roomBySocket.delete(socket);
        roomManager.cancelQueue(userId);
      });
    });
  });

  return { roomManager, broadcastToAll, onlineUserCount: () => socketsByUser.size };
}
