import type { CSSProperties } from 'react';
import type { Operation, Piece as PieceModel, Position } from '@damath/engine';
import { operationGlyph, operationVerb, playerLabel, toAlgebraic } from '../lib/notation';

interface SquareProps<V> {
  pos: Position;
  operation: Operation | null;
  piece: PieceModel<V> | null;
  format: (value: V) => string;
  isSelected: boolean;
  isLegalDestination: boolean;
  /** A square the selected piece's chain capture lands on *mid-sequence*, before its final destination — see Board.tsx's own computation. Always false whenever `isLegalDestination` is true for the same square (the final landing square keeps the ordinary gold treatment, not this one). */
  isCapturePath: boolean;
  isLastMove: boolean;
  isCursor: boolean;
  isSelectable: boolean;
  onActivate: () => void;
  registerRef: (el: HTMLButtonElement | HTMLDivElement | null) => void;
}

function accessibleName<V>(pos: Position, operation: Operation | null, piece: PieceModel<V> | null, format: (value: V) => string): string {
  const alg = toAlgebraic(pos);
  if (!operation) return `${alg}, not playable`;
  const parts = [alg, operationVerb(operation)];
  if (piece) {
    parts.push(`${playerLabel(piece.owner).toLowerCase()} ${format(piece.value)}`);
    if (piece.isDama) parts.push('Dama');
  }
  return parts.join(', ');
}

export function Square<V>({
  pos,
  operation,
  piece,
  format,
  isSelected,
  isLegalDestination,
  isCapturePath,
  isLastMove,
  isCursor,
  isSelectable,
  onActivate,
  registerRef,
}: SquareProps<V>) {
  const baseStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: '1',
    position: 'relative',
    border: 'none',
    padding: 0,
    fontFamily: 'inherit',
  };

  if (!operation) {
    return (
      // Focusable (not just a static div): the keyboard cursor legitimately passes
      // through void squares mid-navigation — see useGame's moveCursor comment.
      <div
        role="gridcell"
        aria-label={accessibleName(pos, operation, piece, format)}
        tabIndex={isCursor ? 0 : -1}
        ref={registerRef}
        style={{ ...baseStyle, background: 'var(--square-void)' }}
      />
    );
  }

  // A piece the current player can legally move this turn -- not shown once it's the
  // one selected (the accent selection ring below already marks that), so the two
  // signals never compete on the same square.
  const isMovablePiece = isSelectable && piece && !isSelected;
  let background = 'var(--square-play)';
  if (isLegalDestination) background = 'var(--square-legal)';
  else if (isCapturePath) background = 'var(--square-legal-path)';
  else if (isMovablePiece) background = 'var(--square-movable)';
  else if (isLastMove) background = 'var(--square-last)';

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={accessibleName(pos, operation, piece, format) + (isLegalDestination ? ', legal destination' : isCapturePath ? ', captures through here' : '')}
      aria-selected={isSelected}
      tabIndex={isCursor ? 0 : -1}
      ref={registerRef}
      onClick={onActivate}
      style={{
        ...baseStyle,
        background,
        cursor: isSelectable || isLegalDestination ? 'pointer' : 'default',
        boxShadow: isSelected ? 'inset 0 0 0 2px var(--accent)' : undefined,
      }}
    >
      {/* The physical board prints the operation in the square's center — and once a
          chip sits on that square, the printed glyph is physically covered. Rendered
          unconditionally here: the piece itself now lives in Board.tsx's `PieceLayer`
          overlay (a separate absolutely-positioned layer, keyed by piece id so a move
          animates instead of snapping — see PieceLayer.tsx), which visually covers this
          glyph by stacking on top whenever a piece actually occupies the square. */}
      {/* `clamp(10px, 2.5vw, var(--fs-title))`, not a flat `var(--fs-title)` — the piece
          covering this glyph (Board.tsx's PieceLayer overlay, Piece.tsx) is sized as a
          *percentage* of the cell, so it shrinks with the board on a narrow viewport;
          a fixed-size glyph doesn't, and on a small enough phone width the piece can
          shrink to where it no longer fully covers a 20px glyph underneath it. Scaling
          the glyph down together with the viewport keeps the same "piece comfortably
          covers glyph" ratio at any size instead of just at the desktop cap this token
          was tuned for. Ceilings out at the original `var(--fs-title)` from roughly
          tablet width up, so desktop rendering is pixel-identical to before. */}
      <span aria-hidden="true" style={{ fontSize: 'clamp(16px, 4vw, var(--fs-display))', fontWeight: 500, color: 'var(--square-op)' }}>
        {operationGlyph(operation)}
      </span>
    </button>
  );
}
