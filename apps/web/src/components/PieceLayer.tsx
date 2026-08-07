import type { GameState } from '@damath/engine';
import { Piece } from './Piece';

interface PieceLayerProps<V> {
  game: GameState<V>;
  format: (value: V) => string;
  /** Same convention as Board.tsx's own `flipped` — reverses which physical row/column renders at the top/left. */
  flipped: boolean;
}

/**
 * All of the board's pieces as one absolutely-positioned overlay above the grid, each
 * keyed by `piece.id` — not by square. `game.ts`'s `applyMove` spreads `{ ...piece,
 * isDama: true }` on promotion rather than issuing a fresh id, so a piece's id is stable
 * for its entire life on the board, from placement to capture. That stability is what
 * makes a moved piece a single persistent DOM node whose `top`/`left` change between
 * renders (React reconciles by key, not position) — the precondition for
 * global.css's `.board-piece` CSS transition to actually animate a slide, instead of the
 * old per-square rendering, where a moved piece was really two unrelated mount/unmount
 * events (one square's piece disappearing, a different square's piece appearing) with
 * nothing for a transition to interpolate between.
 *
 * Square.tsx still renders each cell's operation glyph unconditionally now — a piece
 * sitting on that square visually covers it by stacking on top, exactly the same result
 * as the old conditional render, just via z-order instead of a conditional.
 */
export function PieceLayer<V>({ game, format, flipped }: PieceLayerProps<V>) {
  const entries: { row: number; col: number; piece: NonNullable<(typeof game.board)[number][number]> }[] = [];
  game.board.forEach((rowPieces, row) => {
    rowPieces.forEach((piece, col) => {
      if (piece) entries.push({ row, col, piece });
    });
  });

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {entries.map(({ row, col, piece }) => {
        const visualRow = flipped ? row : 7 - row;
        const visualCol = flipped ? 7 - col : col;
        return (
          <div
            key={piece.id}
            className="board-piece"
            style={{
              position: 'absolute',
              top: `${String(visualRow * 12.5)}%`,
              left: `${String(visualCol * 12.5)}%`,
              width: '12.5%',
              height: '12.5%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Piece piece={piece} format={format} />
          </div>
        );
      })}
    </div>
  );
}
