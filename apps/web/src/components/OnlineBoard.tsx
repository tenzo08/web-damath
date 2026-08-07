import { operationAt } from '@damath/engine';
import type { Player, Position } from '@damath/engine';
import { isPlayable, positionKey, samePosition } from '../lib/board';
import { operationGlyph, operationVerb, playerLabel, toAlgebraic } from '../lib/notation';
import { MiniPieceView } from './diagram/MiniBoard';
import type { PublicGameView, WirePiece } from '../lib/onlineProtocol';

function accessibleName(pos: Position, piece: WirePiece | null): string {
  const alg = toAlgebraic(pos);
  const parts = [alg, operationVerb(operationAt(pos))];
  if (piece) {
    parts.push(`${playerLabel(piece.owner).toLowerCase()} ${piece.value}`);
    if (piece.isDama) parts.push('Dama');
  }
  return parts.join(', ');
}

interface OnlineBoardProps {
  view: PublicGameView;
  selected: Position | null;
  myColor: Player | null;
  /** Squares holding a piece the seated player can legally move this turn -- empty when it isn't their turn, they're spectating, or mid-history-browse. See OnlineGameScreen's own `legalFrom` for how it's computed client-side from the replayed live position. */
  legalFrom: Set<string>;
  onActivateSquare: (pos: Position) => void;
}

/**
 * The server already sent formatted display values, so this renders `PublicGameView`
 * directly rather than routing through the generic `Board`/`Square`/`Piece` trio built
 * for a local `GameState<V>` — see `useOnlineGame`'s doc comment. Flips to the seated
 * player's own side automatically, same convenience the local board offers manually.
 */
export function OnlineBoard({ view, selected, myColor, legalFrom, onActivateSquare }: OnlineBoardProps) {
  const flipped = myColor === 'black';
  const rows = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div
      role="grid"
      aria-label="Online Damath board"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        width: '100%',
        aspectRatio: '1',
        // Same viewport-height-aware cap as the local board (Board.tsx) — keeps the
        // online board fitting a desktop viewport without forcing page scroll.
        maxWidth: 'min(560px, 58vh, 100%)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        position: 'relative',
      }}
    >
      {rows.map((row) =>
        cols.map((col) => {
          const pos: Position = { row, col };
          const key = positionKey(pos);
          if (!isPlayable(pos)) {
            return <div key={key} role="gridcell" aria-label={`${key}, not playable`} style={{ background: 'var(--square-void)', aspectRatio: '1' }} />;
          }
          const piece = view.board[row]?.[col] ?? null;
          const isSelected = selected !== null && samePosition(selected, pos);
          const isMovable = !isSelected && piece !== null && legalFrom.has(key);
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-label={accessibleName(pos, piece)}
              onClick={() => onActivateSquare(pos)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                aspectRatio: '1',
                border: 'none',
                padding: 0,
                background: isMovable ? 'var(--square-movable)' : 'var(--square-play)',
                boxShadow: isSelected ? 'inset 0 0 0 2px var(--accent)' : undefined,
                cursor: 'pointer',
              }}
            >
              {/* The piece itself renders in the absolutely-positioned overlay below,
                  keyed by `piece.id` so a move animates as a slide (see Board.tsx's
                  PieceLayer for the identical local-play reasoning) — this glyph is
                  rendered unconditionally and simply gets visually covered when a piece
                  occupies the square. `clamp()` instead of a flat token for the same
                  reason Square.tsx's identical glyph uses it: the covering piece shrinks
                  with the board on a narrow viewport (it's a percentage of the cell), so
                  the glyph has to shrink with it too or a fixed-size glyph can eventually
                  peek out from under a small enough piece. */}
              <span aria-hidden="true" style={{ fontSize: 'clamp(10px, 2.5vw, var(--fs-title))', fontWeight: 500, color: 'var(--square-op)' }}>
                {operationGlyph(operationAt(pos))}
              </span>
            </button>
          );
        }),
      )}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {rows.flatMap((row) =>
          cols
            .map((col) => ({ row, col, piece: view.board[row]?.[col] ?? null }))
            .filter((entry): entry is { row: number; col: number; piece: WirePiece } => entry.piece !== null)
            .map(({ row, col, piece }) => {
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
                  <MiniPieceView owner={piece.owner} isDama={piece.isDama} label={piece.value} />
                </div>
              );
            }),
        )}
      </div>
    </div>
  );
}
