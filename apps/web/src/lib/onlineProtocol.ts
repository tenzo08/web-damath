import type { Player, Position, VariantId } from '@damath/engine';

/**
 * Hand-written to mirror apps/server/src/game/{room,ws}.ts's wire shapes — client and
 * server don't share a types package for the socket protocol (it's JSON over a
 * WebSocket, the same boundary any two independently-deployable services would have).
 */
export interface WirePiece {
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
  moveCount: number;
  players: { white: string | null; black: string | null };
  opponentType: 'human' | 'bot';
  botTier: string | null;
  resignedBy: Player | null;
}

export type ServerMessage =
  | { type: 'room_created'; roomId: string; view: PublicGameView }
  | { type: 'joined'; roomId: string; color: Player | null }
  | { type: 'queued' }
  | { type: 'queue_cancelled' }
  | { type: 'matched'; roomId: string; color: Player; view: PublicGameView }
  | { type: 'state'; view: PublicGameView }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'create_room'; variantId: VariantId }
  | { type: 'join_room'; roomId: string }
  | { type: 'queue'; variantId: VariantId }
  | { type: 'decline_bot' }
  | { type: 'cancel_queue' }
  | { type: 'move'; from: Position; to: Position }
  | { type: 'resign' };
