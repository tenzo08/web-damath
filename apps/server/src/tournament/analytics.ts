import { applyMove, createGame, operationAt, pieceAt, scoreCapture } from '@damath/engine';
import type { AnyVariant, Move, Operation, Variant } from '@damath/engine';
import { toNumberFor } from '@damath/ai';
import type { PersistedGame } from '../game/store.js';

type ValueOf<T> = T extends Variant<infer V> ? V : never;

const ALL_OPERATIONS: readonly Operation[] = ['+', '-', '*', '/'];

export interface OperationStat {
  readonly operation: Operation;
  readonly capturesMade: number;
  /** Sum, not average — the client divides by `capturesMade` itself, keeping this a plain number instead of losing precision to a server-side rounding choice. */
  readonly totalValueGained: number;
  readonly capturesSuffered: number;
  readonly totalValueLost: number;
}

export interface ParticipantAnalytics {
  readonly participantId: string;
  readonly gamesPlayed: number;
  /** Always exactly `ALL_OPERATIONS.length` entries, one per operation, zeroed rather than omitted when a participant never captured/was captured on that operation — so the client never has to guess whether a missing entry means zero or "not computed." */
  readonly operations: readonly OperationStat[];
}

export interface TournamentAnalytics {
  readonly tournamentId: string;
  readonly participants: readonly ParticipantAnalytics[];
}

function emptyOperationStats(): Record<Operation, { capturesMade: number; totalValueGained: number; capturesSuffered: number; totalValueLost: number }> {
  return {
    '+': { capturesMade: 0, totalValueGained: 0, capturesSuffered: 0, totalValueLost: 0 },
    '-': { capturesMade: 0, totalValueGained: 0, capturesSuffered: 0, totalValueLost: 0 },
    '*': { capturesMade: 0, totalValueGained: 0, capturesSuffered: 0, totalValueLost: 0 },
    '/': { capturesMade: 0, totalValueGained: 0, capturesSuffered: 0, totalValueLost: 0 },
  };
}

/**
 * Per-participant, per-operation capture stats across every *finished* game a
 * tournament's participants played in it — "which operations a student struggles
 * with," the teacher-facing signal DESIGN.md's own move-ledger doc comment already
 * named as a use case but nothing previously aggregated. Deliberately doesn't touch
 * the AI (`packages/ai`'s search) at all: running a real minimax review over every
 * move of every tournament game synchronously in one HTTP request would be far too
 * slow, and the *actual* points a capture won or cost — `scoreCapture`, the same
 * exact function `applyMove`/`ledger.ts` already use to compute it — is a purely
 * mechanical replay, no search needed. `toNumberFor` (packages/ai's own value-scale
 * bridge, already used the identical way in gameReview.ts) turns a variant-typed
 * chip value into a comparable/summable `number` for aggregation; it's an
 * approximation only for Radical/Polynomial variants (see its own doc comment), never
 * used for a game's real, on-board score.
 *
 * Pure and synchronously testable on purpose — no I/O, same "pure core, I/O at the
 * edges" shape as bracket.ts, this package's other tournament-domain pure module.
 */
export function computeTournamentAnalytics(
  tournamentId: string,
  participantIds: readonly string[],
  games: readonly PersistedGame[],
  variant: AnyVariant,
): TournamentAnalytics {
  type V = ValueOf<AnyVariant>;
  const typedVariant = variant as Variant<V>;
  const toNumber = toNumberFor<V>(variant.id);
  const arithmetic = typedVariant.arithmetic;

  const gamesPlayed = new Map<string, number>(participantIds.map((id) => [id, 0]));
  const opStats = new Map<string, ReturnType<typeof emptyOperationStats>>(participantIds.map((id) => [id, emptyOperationStats()]));

  for (const game of games) {
    if (game.status !== 'finished') continue; // an abandoned/active game has no settled captures to attribute credit for
    const { white, black } = game.players;
    if (white && gamesPlayed.has(white)) gamesPlayed.set(white, (gamesPlayed.get(white) ?? 0) + 1);
    if (black && gamesPlayed.has(black)) gamesPlayed.set(black, (gamesPlayed.get(black) ?? 0) + 1);

    let state = createGame(typedVariant);
    for (const move of game.moveHistory as Move<V>[]) {
      const mover = pieceAt(state.board, move.from);
      if (!mover) break; // defensive — a persisted move history is always valid, but never throw computing a report
      const moverId = mover.owner === 'white' ? white : black;
      for (const step of move.captures) {
        const operation = operationAt(step.landedAt);
        const value = toNumber(scoreCapture(mover, step.capturedPiece, operation, arithmetic));
        const captureeId = step.capturedPiece.owner === 'white' ? white : black;
        if (moverId) {
          const stats = opStats.get(moverId)?.[operation];
          if (stats) {
            stats.capturesMade += 1;
            stats.totalValueGained += value;
          }
        }
        if (captureeId) {
          const stats = opStats.get(captureeId)?.[operation];
          if (stats) {
            stats.capturesSuffered += 1;
            stats.totalValueLost += value;
          }
        }
      }
      state = applyMove(state, move, typedVariant, { checkGameOver: false });
    }
  }

  return {
    tournamentId,
    participants: participantIds.map((participantId) => {
      const stats = opStats.get(participantId) ?? emptyOperationStats();
      return {
        participantId,
        gamesPlayed: gamesPlayed.get(participantId) ?? 0,
        operations: ALL_OPERATIONS.map((operation) => ({ operation, ...stats[operation] })),
      };
    }),
  };
}
