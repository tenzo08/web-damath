import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { DifficultyTier } from '@damath/ai';
import type { Position, VariantId } from '@damath/engine';
import type { PublicGameView, TournamentMatchRef } from './room.js';
import { RoomManager } from './rooms.js';
import type { GameStore } from './store.js';
import type { UserStore } from '../auth/store.js';
import type { ModerationStore } from '../moderation/store.js';

export interface GameSocketOptions {
  gameStore: GameStore;
  /** Forwarded straight into `RoomManager`'s option of the same name — see rooms.ts. */
  userStore: UserStore;
  /** Forwarded straight into `RoomManager`'s option of the same name — see rooms.ts. */
  moderationStore: ModerationStore;
  queueBotTimeoutMs: number;
  queueBotEnabled: boolean;
  queueBotTier: DifficultyTier;
  /**
   * How long a player may stay fully disconnected (zero open sockets) from an active
   * human-vs-human room before forfeiting it — "the first player who disconnected loses
   * that game," and the game must never be resumable after that grace period lapses.
   * Deliberately longer than `useOnlineGame.ts`'s own client-side reconnect budget
   * (5 attempts × 1500ms ≈ 7.5s) so an ordinary WiFi hiccup or a laptop waking from
   * sleep — which the client already retries on its own — never trips this; this is for
   * someone who has actually left.
   */
  disconnectForfeitMs: number;
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

/** Every board is 8x8 (docs/DAMATH_RULES.md §1.1) across every variant -- a bound the wire boundary should enforce itself, not rely on `legalMoves().find(...)` incidentally rejecting an out-of-range value later. */
const BOARD_SIZE = 8;

function isBoardCoordinate(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < BOARD_SIZE;
}

function isPosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) return false;
  const { row, col } = value as Position;
  return typeof row === 'number' && typeof col === 'number' && isBoardCoordinate(row) && isBoardCoordinate(col);
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
  // The other direction of socketsByUser — needed so the close handler can tell whether
  // *this specific room* still has any of the user's sockets subscribed, independent of
  // whether the user has other sockets open elsewhere (a second tab on a different
  // room). Populated once per connection, never mutated afterward.
  const userBySocket = new Map<WebSocket, string>();
  // Pending disconnect-forfeit grace timers, keyed by `${userId}:${roomId}` — not by
  // userId alone. A user can be legitimately seated in more than one active human room
  // at once (a direct invite-link game and a separate tournament match, or two tabs on
  // two different invites); keying by userId alone meant only one room's timer could
  // ever be pending at a time, so dropping out of two rooms simultaneously silently
  // lost the forfeit for whichever room's socket happened to close first, and any
  // reconnect anywhere cancelled a pending forfeit for a room the user hadn't actually
  // returned to. Cancelled specifically when the user resubscribes to *that* room (see
  // the create_room/join_room/queue handlers and `onMatched` below) — not on every new
  // connection, since a fresh socket doesn't prove presence in any particular room
  // until it actually (re)joins one.
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // `@fastify/rate-limit` (app.ts) only guards the HTTP-level `/ws` upgrade itself, once
  // per connection -- every gameplay message sent afterward over an already-open socket
  // (move, resign, queue, ...) was previously unthrottled. A buggy or malicious client
  // spamming `move` messages costs real work per message (legalMoves(), a store write),
  // so this bounds it per socket, independent of the room/user it's acting on.
  const MESSAGE_RATE_LIMIT = 40;
  const MESSAGE_RATE_WINDOW_MS = 10_000;
  const messageRateState = new Map<WebSocket, { count: number; windowStart: number }>();

  function exceedsRateLimit(socket: WebSocket): boolean {
    const now = Date.now();
    const state = messageRateState.get(socket);
    if (!state || now - state.windowStart >= MESSAGE_RATE_WINDOW_MS) {
      messageRateState.set(socket, { count: 1, windowStart: now });
      return false;
    }
    state.count += 1;
    return state.count > MESSAGE_RATE_LIMIT;
  }

  function timerKey(userId: string, roomId: string): string {
    return `${userId}:${roomId}`;
  }

  function clearDisconnectTimer(userId: string, roomId: string): void {
    const key = timerKey(userId, roomId);
    const timer = disconnectTimers.get(key);
    if (timer) clearTimeout(timer);
    disconnectTimers.delete(key);
  }

  /** Every socket currently subscribed to `roomId` that belongs to `userId`. */
  function userSocketsInRoom(userId: string, roomId: string): WebSocket[] {
    return [...(socketsByRoom.get(roomId) ?? [])].filter((s) => userBySocket.get(s) === userId);
  }

  /**
   * Called once a user's last socket *subscribed to this particular room* closes, while
   * they were seated in it as an active human-vs-human game — independent of whether
   * they still have other sockets open elsewhere. If they haven't reconnected to *this*
   * room by the time the grace period elapses, forfeits it on their behalf via the exact
   * same `RoomManager.resign` path a deliberate resignation uses — same winner
   * computation, same rating update, same tournament auto-report, same persistence. The
   * only thing layered on top here is a one-off `disconnect_forfeit` notice so the
   * remaining player's UI can say "disconnected" rather than "resigned".
   */
  function scheduleDisconnectForfeit(userId: string, roomId: string): void {
    clearDisconnectTimer(userId, roomId);
    const key = timerKey(userId, roomId);
    const timer = setTimeout(() => {
      void (async () => {
        disconnectTimers.delete(key);
        if (userSocketsInRoom(userId, roomId).length > 0) return; // reconnected to this room in the meantime
        const room = await roomManager.getRoom(roomId);
        if (!room || room.opponentType !== 'human') return;
        const color = room.colorOf(userId);
        if (color === null) return;
        const outcome = await roomManager.resign(roomId, userId);
        if (!outcome.ok) return; // already over by some other route (e.g. they'd already resigned)
        for (const socket of socketsByRoom.get(roomId) ?? []) send(socket, { type: 'disconnect_forfeit', roomId, color });
        broadcastRoom(outcome.view);
      })();
    }, options.disconnectForfeitMs);
    disconnectTimers.set(key, timer);
  }

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
    moderationStore: options.moderationStore,
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
      clearDisconnectTimer(userId, view.roomId);
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
      userBySocket.set(socket, userId);
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
          if (exceedsRateLimit(socket)) {
            send(socket, { type: 'error', message: 'too many messages, slow down' });
            return;
          }
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
              clearDisconnectTimer(userId, room.id);
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
              // Proves presence back in *this specific* room — the actual reconnect path
              // (`useOnlineGame.ts`'s `onopen` re-sends `join_room` for the room it was
              // last seated in), so this is where a pending forfeit for this room gets
              // cancelled, not generically on every new connection.
              clearDisconnectTimer(userId, result.room.id);
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
                clearDisconnectTimer(userId, result.room.id);
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
        messageRateState.delete(socket);
        const roomId = roomBySocket.get(socket);
        const userSockets = socketsByUser.get(userId);
        userSockets?.delete(socket);
        const wentFullyOffline = userSockets !== undefined && userSockets.size === 0;
        if (wentFullyOffline) {
          socketsByUser.delete(userId);
          broadcastOnlineCount();
        }
        if (roomId) socketsByRoom.get(roomId)?.delete(socket);
        roomBySocket.delete(socket);
        userBySocket.delete(socket);
        roomManager.cancelQueue(userId);
        // Scoped per room, not to "wentFullyOffline" — a user can be legitimately seated
        // in more than one active human room at once (see the timer map's own doc
        // comment above), and closing their only socket subscribed to *this* room must
        // start that room's forfeit clock even if they still have another socket open on
        // a completely different room.
        if (roomId && userSocketsInRoom(userId, roomId).length === 0) scheduleDisconnectForfeit(userId, roomId);
      });
    });
  });

  return { roomManager, broadcastToAll, onlineUserCount: () => socketsByUser.size };
}
