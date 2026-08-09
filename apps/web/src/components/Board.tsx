import { useEffect, useRef } from 'react';
import { operationAt, pieceAt } from '@damath/engine';
import type { GameState, Move, Position } from '@damath/engine';
import { isPlayable, positionKey, samePosition } from '../lib/board';
import { Square } from './Square';
import { PieceLayer } from './PieceLayer';

interface BoardProps<V> {
  game: GameState<V>;
  format: (value: V) => string;
  selected: Position | null;
  cursor: Position;
  legalFrom: Set<string>;
  destinations: Move<V>[];
  lastMove: Move<V> | null;
  /** Renders from Dark's side (row 0 at top) instead of Light's — a pass-and-play convenience, purely visual. Positions/labels are unaffected; only DOM order in the CSS grid changes. */
  flipped: boolean;
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
  flipped,
  onActivateSquare,
  onMoveCursor,
  onActivateCursor,
  onClearSelection,
}: BoardProps<V>) {
  const refs = useRef(new Map<string, HTMLButtonElement | HTMLDivElement>());

  // Also re-runs on `flipped`, not just `cursor`: reversing the row/col traversal order
  // (friend mode's auto-flip to whichever side is on move) makes React recreate the
  // reordered grid cells rather than just repositioning them, which silently drops
  // keyboard focus from the cursor square on every flip if this only depended on
  // `cursor` itself — found by a real DOM node going `isConnected: false` after a move
  // triggered a flip.
  useEffect(() => {
    refs.current.get(positionKey(cursor))?.focus();
  }, [cursor, flipped]);

  const rows = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

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
        position: 'relative',
        // Capped by viewport height as well as width so the board (plus the clock and
        // player cards stacked with it) actually fits a desktop viewport without
        // forcing the page to scroll — a smaller, height-aware scale rather than the
        // previous flat 760px, which regularly ran taller than the window.
        maxWidth: 'min(560px, 58vh, 100%)',
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
          // A chain capture's own intermediate landing squares — every step but the
          // last (the last step's `landedAt` always equals the move's own `to`, already
          // covered by `isDestination` above). Checked across every candidate move from
          // the selected piece, not just one: two different capture paths can share an
          // early waypoint before diverging, and this square is "part of the path"
          // either way.
          const isCapturePath =
            !isDestination && destinations.some((m) => m.captures.slice(0, -1).some((step) => samePosition(step.landedAt, pos)));
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
              isCapturePath={isCapturePath}
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
      <PieceLayer game={game} format={format} flipped={flipped} />
    </div>
  );
}
