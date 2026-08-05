import { useEffect, useRef } from 'react';
import { operationAt, pieceAt } from '@damath/engine';
import type { GameState, Move, Position } from '@damath/engine';
import { isPlayable, positionKey, samePosition } from '../lib/board';
import { Square } from './Square';

interface BoardProps<V> {
  game: GameState<V>;
  format: (value: V) => string;
  selected: Position | null;
  cursor: Position;
  legalFrom: Set<string>;
  destinations: Move<V>[];
  lastMove: Move<V> | null;
  onActivateSquare: (pos: Position) => void;
  onMoveCursor: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onActivateCursor: () => void;
  onClearSelection: () => void;
}

const KEY_TO_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function Board<V>({
  game,
  format,
  selected,
  cursor,
  legalFrom,
  destinations,
  lastMove,
  onActivateSquare,
  onMoveCursor,
  onActivateCursor,
  onClearSelection,
}: BoardProps<V>) {
  const refs = useRef(new Map<string, HTMLButtonElement | HTMLDivElement>());

  useEffect(() => {
    refs.current.get(positionKey(cursor))?.focus();
  }, [cursor]);

  const rows = [7, 6, 5, 4, 3, 2, 1, 0];
  const cols = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div
      role="grid"
      aria-label="Damath board"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        width: '100%',
        aspectRatio: '1',
        maxWidth: 760,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        // Deliberately no `overflow: hidden` here — it would clip the focus ring at the
        // board's edges, and docs/DESIGN.md §6 is explicit: "Never remove outlines."
        // The tradeoff is square corners on the four outermost squares.
      }}
      onKeyDown={(e) => {
        const dir = KEY_TO_DIR[e.key];
        if (dir) {
          e.preventDefault();
          onMoveCursor(dir);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivateCursor();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onClearSelection();
        }
      }}
    >
      {rows.map((row) =>
        cols.map((col) => {
          const pos: Position = { row, col };
          const key = positionKey(pos);
          const playable = isPlayable(pos);
          const operation = playable ? operationAt(pos) : null;
          const piece = pieceAt(game.board, pos);
          const isDestination = destinations.some((m) => samePosition(m.to, pos));
          const isLastMoveSquare =
            lastMove !== null &&
            (samePosition(lastMove.from, pos) ||
              samePosition(lastMove.to, pos) ||
              lastMove.captures.some((c) => samePosition(c.landedAt, pos)));

          return (
            <Square
              key={key}
              pos={pos}
              operation={operation}
              piece={piece}
              format={format}
              isSelected={selected !== null && samePosition(selected, pos)}
              isLegalDestination={isDestination}
              isLastMove={isLastMoveSquare}
              isCursor={samePosition(cursor, pos)}
              isSelectable={legalFrom.has(key)}
              onActivate={() => onActivateSquare(pos)}
              registerRef={(el) => {
                if (el) refs.current.set(key, el);
                else refs.current.delete(key);
              }}
            />
          );
        }),
      )}
    </div>
  );
}
