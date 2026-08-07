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
        maxWidth: 760,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
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
              {piece ? (
                <MiniPieceView owner={piece.owner} isDama={piece.isDama} label={piece.value} />
              ) : (
                <span aria-hidden="true" style={{ fontSize: 'var(--fs-title)', fontWeight: 500, color: 'var(--square-op)' }}>
                  {operationGlyph(operationAt(pos))}
                </span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}
