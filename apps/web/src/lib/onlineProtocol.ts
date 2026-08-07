import type { Player, Position, VariantId } from '@damath/engine';

/**
 * Hand-written to mirror apps/server/src/game/{room,ws}.ts's wire shapes — client and
 * server don't share a types package for the socket protocol (it's JSON over a
 * WebSocket, the same boundary any two independently-deployable services would have).
 */
export interface WirePiece {
  id: string;
  owner: Player;
  isDama: boolean;
  value: string;
}

export interface PublicGameView {
  roomId: string;
  variantId: VariantId;
  board: readonly (readonly (WirePiece | null)[])[];
  turn: Player;
  scores: { white: string; black: string };
  status: 'active' | 'finished';
  finalScores: { white: string; black: string } | null;
  winner: Player | null;
  /** A real draw the players agreed to, distinct from a score-tie or resignation — see apps/server/src/game/room.ts. */
  drawnByAgreement: boolean;
  /** The color that currently has a pending draw offer out, or `null` if none. */
  drawOfferedBy: Player | null;
  moveCount: number;
  /** Genuine `Move<V>` values, untyped here for the same reason the server's own `PublicGameView` leaves it `unknown` — see room.ts. Cast to `Move<V>[]` once `variantId` identifies the concrete `V`, same JSON-boundary pattern used everywhere else this data crosses a process boundary. */
  moveHistory: readonly unknown[];
  players: { white: string | null; black: string | null };
  opponentType: 'human' | 'bot';
  botTier: string | null;
  /** A friendly display name, never "Computer" -- null for a human game. */
  botNickname: string | null;
  resignedBy: Player | null;
  tournamentMatch: { tournamentId: string; round: number; index: number } | null;
}

/** A tournament, exactly as `tournamentClient.ts`'s `Tournament` shape — duplicated rather than imported (that file's types are for REST responses; this one's for the WS payload) to keep the two boundaries independently editable, same reasoning as `WirePiece`/`PublicGameView` above. */
export interface WireTournament {
  id: string;
  name: string;
  variantId: VariantId;
  creatorUserId: string;
  joinCode: string;
  participants: string[];
  status: 'lobby' | 'in_progress' | 'complete';
  startTime: string | null;
  endTime: string | null;
}

export type ServerMessage =
  | { type: 'room_created'; roomId: string; view: PublicGameView }
  | { type: 'joined'; roomId: string; color: Player | null }
  /** Response to a `spectate` request — unlike `joined`, there's no `color`, since a spectator never has one. */
  | { type: 'spectating'; roomId: string; view: PublicGameView }
  | { type: 'queued' }
  | { type: 'queue_cancelled' }
  | { type: 'matched'; roomId: string; color: Player; view: PublicGameView }
  | { type: 'state'; view: PublicGameView }
  | { type: 'error'; message: string }
  /** Broadcast to every connected socket — see ws.ts's `broadcastOnlineCount`. */
  | { type: 'online_count'; count: number }
  /** Broadcast to every connected socket whenever any tournament is created, joined, started, or has a result reported (manually or auto-reported) — see manager.ts's `onChange`. */
  | { type: 'tournament_updated'; tournament: WireTournament }
  /**
   * A one-off notice sent to everyone still subscribed to a room the instant the server
   * forfeits it on a fully-disconnected player's behalf (ws.ts's `scheduleDisconnectForfeit`)
   * — `color` is the side that forfeited. Always immediately followed by a `state`
   * message carrying the same outcome as a real resignation (same winner, same rating
   * update); this message exists only so the UI can say "disconnected", not "resigned".
   */
  | { type: 'disconnect_forfeit'; roomId: string; color: Player };

export type ClientMessage =
  | { type: 'create_room'; variantId: VariantId }
  | { type: 'join_room'; roomId: string }
  | { type: 'spectate'; roomId: string }
  | { type: 'queue'; variantId: VariantId }
  | { type: 'decline_bot' }
  | { type: 'cancel_queue' }
  | { type: 'move'; from: Position; to: Position }
  | { type: 'resign' }
  | { type: 'offer_draw' }
  | { type: 'respond_draw'; accept: boolean };
