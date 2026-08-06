import type { LedgerEntry } from '../lib/ledger';
import { formatLedgerRow } from '../lib/ledger';

interface MoveLedgerProps<V> {
  entries: LedgerEntry<V>[];
  format: (value: V) => string;
  /** `null` means "viewing the live position." Non-null is how many played moves the board currently shows — see `useGame`'s `viewIndex`. */
  viewIndex: number | null;
  onSelectMove: (index: number) => void;
  onExitReplay: () => void;
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

/** docs/DESIGN.md §8, the signature element: a monospace running record, one line per move. Also the replay scrubber — every entry is clickable, jumping the board (not the live game) to the position right after that move, per PLANNING.md's "games are stored as move lists" (KNOWLEDGE.md). */
export function MoveLedger<V>({ entries, format, viewIndex, onSelectMove, onExitReplay }: MoveLedgerProps<V>) {
  const isViewingHistory = viewIndex !== null;

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
        <ol
          className="scroll-hidden"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            overflowY: 'auto',
            minHeight: 0,
            fontSize: 'var(--fs-meta)',
          }}
        >
          {entries.map((entry) => {
            const row = formatLedgerRow(entry, format);
            const isCurrent = viewIndex === entry.ply;
            return (
              <li key={row.index}>
                <button
                  type="button"
                  onClick={() => onSelectMove(entry.ply)}
                  aria-current={isCurrent}
                  style={{
                    display: 'flex',
                    width: '100%',
                    gap: 'var(--gap-sm)',
                    padding: '2px 4px',
                    margin: '0 -4px',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    background: isCurrent ? 'var(--accent-bg)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', minWidth: '2.5em' }}>{row.index}</span>
                  <span style={{ minWidth: '1em' }}>{row.player}</span>
                  <span style={{ minWidth: '7em' }}>{row.path}</span>
                  <span style={{ flex: 1, color: 'var(--text-primary)' }}>{row.arithmetic}</span>
                  <span style={{ fontWeight: 700 }}>{row.total}</span>
                  {row.promoted && (
                    <span aria-label="promoted to Dama" style={{ color: 'var(--accent)' }}>
                      ⬥
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
