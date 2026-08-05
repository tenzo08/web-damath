import { useCallback, useMemo, useReducer } from 'react';
import { applyMove, createGame, finalScores, legalMoves, pieceAt } from '@damath/engine';
import type { GameState, Move, Player, Position, Variant } from '@damath/engine';
import { buildLedgerEntry, type LedgerEntry } from '../lib/ledger';
import { isPlayable, positionKey, samePosition } from '../lib/board';
import { playerLabel, toAlgebraic } from '../lib/notation';

interface State<V> {
  game: GameState<V>;
  ledger: LedgerEntry<V>[];
  selected: Position | null;
  cursor: Position;
  announcement: string;
}

type Action<V> =
  | { type: 'NEW_GAME' }
  | { type: 'SELECT'; pos: Position }
  | { type: 'MOVE'; move: Move<V> }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_CURSOR'; pos: Position };

function firstPlayableSquare(): Position {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (isPlayable({ row, col })) return { row, col };
    }
  }
  throw new Error('unreachable: an 8x8 board always has a playable square');
}

const OPERATION_NOUN_BY_GLYPH: Record<string, string> = {
  '+': 'addition',
  '−': 'subtraction',
  '×': 'multiplication',
  '÷': 'division',
};

function opponentOf(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

function describeMove<V>(entry: LedgerEntry<V>, mover: NonNullable<ReturnType<typeof pieceAt<V>>>, variant: Variant<V>): string {
  const who = playerLabel(entry.player);
  const format = variant.arithmetic.format;
  if (entry.steps.length === 0) {
    return `${who} ${format(mover.value)} moves to ${toAlgebraic(entry.move.to)}.`;
  }
  if (entry.steps.length === 1) {
    const step = entry.steps[0];
    if (!step) throw new Error('unreachable: steps.length === 1');
    const takenLabel = playerLabel(opponentOf(entry.player)).toLowerCase();
    const word = OPERATION_NOUN_BY_GLYPH[step.operation] ?? 'arithmetic';
    return `${who} ${format(mover.value)} captures ${takenLabel} ${format(step.taken)} by ${word}. Score ${format(entry.runningTotal)}.`;
  }
  return `${who} ${format(mover.value)} captures ${String(entry.steps.length)} chips. Score ${format(entry.runningTotal)}.`;
}

function endOfGameMessage<V>(game: GameState<V>, variant: Variant<V>): string {
  const arithmetic = variant.arithmetic;
  const scores = finalScores(game, arithmetic);
  const stillHasMoves = legalMoves(game).length > 0;
  const reason = stillHasMoves ? 'Position repeated three times' : 'No legal moves';
  const order = arithmetic.compare(scores.white, scores.black);
  if (order === 0) {
    return `${reason}. Draw at ${arithmetic.format(scores.white)} each.`;
  }
  const winner: Player = order > 0 ? 'white' : 'black';
  const winnerScore = order > 0 ? scores.white : scores.black;
  const loserScore = order > 0 ? scores.black : scores.white;
  return `${reason}. ${playerLabel(winner)} wins on score ${arithmetic.format(winnerScore)} to ${arithmetic.format(loserScore)}.`;
}

function makeReducer<V>(variant: Variant<V>) {
  return function reducer(state: State<V>, action: Action<V>): State<V> {
    switch (action.type) {
      case 'NEW_GAME': {
        const game = createGame(variant);
        return {
          game,
          selected: null,
          cursor: firstPlayableSquare(),
          ledger: [],
          announcement: `New match. ${variant.name}. ${playerLabel(game.turn)} to move.`,
        };
      }
      case 'SELECT': {
        if (state.game.status === 'finished') return state;
        const piece = pieceAt(state.game.board, action.pos);
        if (!piece || piece.owner !== state.game.turn) return state;
        const hasLegalMove = legalMoves(state.game).some((m) => samePosition(m.from, action.pos));
        if (!hasLegalMove) return state;
        return { ...state, selected: action.pos, cursor: action.pos };
      }
      case 'CLEAR_SELECTION':
        return { ...state, selected: null };
      case 'SET_CURSOR':
        return { ...state, cursor: action.pos };
      case 'MOVE': {
        if (state.game.status === 'finished') return state;
        const mover = pieceAt(state.game.board, action.move.from);
        if (!mover) return state;
        const next = applyMove(state.game, action.move, variant);
        const entry = buildLedgerEntry(state.game, mover, action.move, next, variant);
        const announcement =
          next.status === 'finished'
            ? `${describeMove(entry, mover, variant)} ${endOfGameMessage(next, variant)}`
            : describeMove(entry, mover, variant);
        return {
          ...state,
          game: next,
          selected: null,
          cursor: action.move.to,
          ledger: [...state.ledger, entry],
          announcement,
        };
      }
      default:
        return state;
    }
  };
}

function init<V>(variant: Variant<V>): State<V> {
  const game = createGame(variant);
  return {
    game,
    selected: null,
    cursor: firstPlayableSquare(),
    ledger: [],
    announcement: `New match. ${variant.name}. ${playerLabel(game.turn)} to move.`,
  };
}

/** One React tree per variant — a caller switching to a different chip-value type remounts via `key`, so `variant` is stable for this hook's whole lifetime (see `App.tsx`). */
export function useGame<V>(variant: Variant<V>) {
  const [state, dispatch] = useReducer(makeReducer(variant), variant, init);

  const moves = useMemo(() => legalMoves(state.game), [state.game]);
  const legalFrom = useMemo(() => new Set(moves.map((m) => positionKey(m.from))), [moves]);
  const destinations = useMemo(() => {
    const selected = state.selected;
    return selected ? moves.filter((m) => samePosition(m.from, selected)) : [];
  }, [moves, state.selected]);

  /**
   * Moves the cursor exactly one cell, including onto a non-playable square.
   * This is deliberate, not an oversight: playable squares form a checkerboard, so
   * true diagonal neighbours (the only squares a piece can ever move to) sit at an
   * (odd, odd) offset from any given square. A scheme that skips straight to "the
   * next playable square" moves by (±2, 0) or (0, ±2) per press — every offset it can
   * ever reach has both components even, which can *never* land on a real move
   * destination, no matter how many presses are combined. One cell at a time (Down
   * then Right, say) reaches a true diagonal neighbour in two presses, passing
   * through one void square in between — the void square is still focusable so the
   * cursor visibly rests there, it's just not selectable (docs/DESIGN.md §6).
   */
  const moveCursor = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      const deltas: Record<typeof dir, { dr: number; dc: number }> = {
        up: { dr: 1, dc: 0 },
        down: { dr: -1, dc: 0 },
        left: { dr: 0, dc: -1 },
        right: { dr: 0, dc: 1 },
      };
      const { dr, dc } = deltas[dir];
      const pos = { row: state.cursor.row + dr, col: state.cursor.col + dc };
      if (pos.row < 0 || pos.row > 7 || pos.col < 0 || pos.col > 7) return;
      dispatch({ type: 'SET_CURSOR', pos });
    },
    [state.cursor],
  );

  /**
   * The single decision point for "the player did something to this square" —
   * shared by mouse clicks (any square) and the keyboard's Enter/Space (the cursor
   * square). If a piece is already selected and `pos` is one of its legal
   * destinations, play that move; clicking the selected piece again deselects it;
   * otherwise try to select `pos` as a new piece. Always moves the cursor there too,
   * so switching between mouse and keyboard mid-game stays coherent.
   */
  const activateSquare = useCallback(
    (pos: Position) => {
      if (state.selected) {
        const destination = destinations.find((m) => samePosition(m.to, pos));
        if (destination) {
          dispatch({ type: 'MOVE', move: destination });
          return;
        }
        if (samePosition(state.selected, pos)) {
          dispatch({ type: 'CLEAR_SELECTION' });
          dispatch({ type: 'SET_CURSOR', pos });
          return;
        }
      }
      dispatch({ type: 'SELECT', pos });
      dispatch({ type: 'SET_CURSOR', pos });
    },
    [state.selected, destinations],
  );

  const activateCursor = useCallback(() => activateSquare(state.cursor), [activateSquare, state.cursor]);

  const clearSelection = useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), []);

  const newGame = useCallback(() => dispatch({ type: 'NEW_GAME' }), []);

  /** Applies a move chosen elsewhere (the computer opponent's worker), bypassing select/deselect semantics. */
  const playMove = useCallback((move: Move<V>) => dispatch({ type: 'MOVE', move }), []);

  return {
    game: state.game,
    variant,
    selected: state.selected,
    cursor: state.cursor,
    ledger: state.ledger,
    announcement: state.announcement,
    legalFrom,
    destinations,
    gameOver: state.game.status === 'finished',
    finalScores: state.game.status === 'finished' ? finalScores(state.game, variant.arithmetic) : null,
    activateSquare,
    moveCursor,
    activateCursor,
    clearSelection,
    newGame,
    playMove,
  };
}
