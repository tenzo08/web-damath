import type { Player } from '@damath/engine';
import type { LedgerEntry } from '../lib/ledger';
import { formatLedgerRow } from '../lib/ledger';

interface MoveLedgerProps<V> {
  entries: LedgerEntry<V>[];
  format: (value: V) => string;
  /** `null` means "viewing the live position." Non-null is how many played moves the board currently shows — see `useGame`'s `viewIndex`. */
  viewIndex: number | null;
  onSelectMove: (index: number) => void;
  onExitReplay: () => void;
  /** Which engine side's moves populate the left column — the other side's own moves always populate the right column. Two different viewers of the same online game pass different sides here, which is why the table itself differs per viewer even though the underlying moves don't. */
  leftSide: Player;
  leftLabel: string;
  rightLabel: string;
}

function ScrubberButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
        fontSize: 'var(--fs-meta)',
        padding: '2px 8px',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

interface Round<V> {
  round: number;
  white: LedgerEntry<V> | null;
  black: LedgerEntry<V> | null;
}

/** Pairs plies into White/Black rounds — every move in this engine alternates `turn` exactly once (search.ts), so entries always strictly alternate white, black, white, black, ... starting with white. */
function buildRounds<V>(entries: readonly LedgerEntry<V>[]): Round<V>[] {
  const rounds: Round<V>[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    rounds.push({ round: rounds.length + 1, white: entries[i] ?? null, black: entries[i + 1] ?? null });
  }
  return rounds;
}

function MoveCell<V>({
  entry,
  format,
  isCurrent,
  onSelectMove,
}: {
  entry: LedgerEntry<V> | null;
  format: (value: V) => string;
  isCurrent: boolean;
  onSelectMove: (index: number) => void;
}) {
  if (!entry) return <div style={{ flex: 1 }} />;
  const row = formatLedgerRow(entry, format);
  return (
    <button
      type="button"
      onClick={() => onSelectMove(entry.ply)}
      aria-current={isCurrent}
      style={{
        display: 'flex',
        flex: 1,
        minWidth: 0,
        gap: 'var(--gap-sm)',
        padding: '2px 6px',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        background: isCurrent ? 'var(--accent-bg)' : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius)',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span style={{ minWidth: '7em' }}>{row.path}</span>
      <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.arithmetic}</span>
      <span style={{ fontWeight: 700 }}>{row.total}</span>
      {row.promoted && (
        <span aria-label="promoted to Dama" style={{ color: 'var(--accent)' }}>
          ⬥
        </span>
      )}
    </button>
  );
}

/**
 * docs/DESIGN.md §8, the signature element: a monospace running record, now one row per
 * *round* (a White ply and a Black ply side by side) instead of one interleaved list —
 * a two-column "Player | Opponent" table, chess-scoresheet style. `leftSide` decides
 * which engine color is "Player" for this particular viewer, so the same game's log
 * genuinely differs between two people looking at it from opposite sides. Also the
 * replay scrubber — every entry is clickable, jumping the board (not the live game) to
 * the position right after that move, per PLANNING.md's "games are stored as move
 * lists" (KNOWLEDGE.md).
 */
export function MoveLedger<V>({ entries, format, viewIndex, onSelectMove, onExitReplay, leftSide, leftLabel, rightLabel }: MoveLedgerProps<V>) {
  const isViewingHistory = viewIndex !== null;
  const rounds = buildRounds(entries);

  return (
    <section
      aria-label="Move ledger"
      style={{
        background: 'var(--surface-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-lg)',
        flex: 1,
        minHeight: 0,
        // A bounded height, not "however tall the content is" — this is the one column
        // that's meant to scroll internally rather than push the page taller.
        maxHeight: 'min(70vh, 640px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--pad-sm)' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--fs-micro)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Moves
        </h2>
        {entries.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isViewingHistory ? (
              <>
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                  Move {String(viewIndex)} of {String(entries.length)}
                </span>
                <ScrubberButton label="Live" onClick={onExitReplay} disabled={false} />
              </>
            ) : (
              <span
                style={{
                  fontSize: 'var(--fs-micro)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                }}
              >
                Live
              </span>
            )}
          </div>
        )}
      </div>
      {entries.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-meta)' }}>No moves yet.</p>
      ) : (
        <div style={{ overflowY: 'auto', minHeight: 0 }} className="scroll-hidden">
          <div
            role="row"
            style={{ display: 'flex', gap: 'var(--gap-sm)', padding: '2px 4px', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            <span style={{ minWidth: '2.5em' }} />
            <span style={{ flex: 1 }}>{leftLabel}</span>
            <span style={{ flex: 1 }}>{rightLabel}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-meta)' }}>
            <tbody>
              {rounds.map(({ round, white, black }) => {
                const leftEntry = leftSide === 'white' ? white : black;
                const rightEntry = leftSide === 'white' ? black : white;
                return (
                  <tr key={round}>
                    <td style={{ color: 'var(--text-muted)', minWidth: '2.5em', verticalAlign: 'top', padding: '2px 4px' }}>{round}.</td>
                    <td style={{ padding: 0 }}>
                      <MoveCell
                        entry={leftEntry}
                        format={format}
                        isCurrent={viewIndex === leftEntry?.ply}
                        onSelectMove={onSelectMove}
                      />
                    </td>
                    <td style={{ padding: 0 }}>
                      <MoveCell
                        entry={rightEntry}
                        format={format}
                        isCurrent={viewIndex === rightEntry?.ply}
                        onSelectMove={onSelectMove}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
