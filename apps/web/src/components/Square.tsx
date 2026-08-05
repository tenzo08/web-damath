import type { CSSProperties } from 'react';
import type { Operation, Piece as PieceModel, Position } from '@damath/engine';
import { operationGlyph, operationVerb, playerLabel, toAlgebraic } from '../lib/notation';
import { Piece } from './Piece';

interface SquareProps {
  pos: Position;
  operation: Operation | null;
  piece: PieceModel | null;
  isSelected: boolean;
  isLegalDestination: boolean;
  isLastMove: boolean;
  isCursor: boolean;
  isSelectable: boolean;
  onActivate: () => void;
  registerRef: (el: HTMLButtonElement | HTMLDivElement | null) => void;
}

function accessibleName(pos: Position, operation: Operation | null, piece: PieceModel | null): string {
  const alg = toAlgebraic(pos);
  if (!operation) return `${alg}, not playable`;
  const parts = [alg, operationVerb(operation)];
  if (piece) {
    parts.push(`${playerLabel(piece.owner).toLowerCase()} ${String(piece.value)}`);
    if (piece.isDama) parts.push('Dama');
  }
  return parts.join(', ');
}

export function Square({
  pos,
  operation,
  piece,
  isSelected,
  isLegalDestination,
  isLastMove,
  isCursor,
  isSelectable,
  onActivate,
  registerRef,
}: SquareProps) {
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
        aria-label={accessibleName(pos, operation, piece)}
        tabIndex={isCursor ? 0 : -1}
        ref={registerRef}
        style={{ ...baseStyle, background: 'var(--square-void)' }}
      />
    );
  }

  let background = 'var(--square-play)';
  if (isLegalDestination) background = 'var(--square-legal)';
  else if (isLastMove) background = 'var(--square-last)';

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={accessibleName(pos, operation, piece)}
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
          chip sits on that square, the printed glyph is physically covered. A piece
          hides the operation entirely rather than the two ever sharing the square. */}
      {piece ? (
        <Piece piece={piece} />
      ) : (
        <span aria-hidden="true" style={{ fontSize: 'var(--fs-title)', fontWeight: 500, color: 'var(--square-op)' }}>
          {operationGlyph(operation)}
        </span>
      )}
    </button>
  );
}
