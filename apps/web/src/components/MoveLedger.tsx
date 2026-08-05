import type { LedgerEntry } from '../lib/ledger';
import { formatLedgerRow } from '../lib/ledger';

interface MoveLedgerProps {
  entries: LedgerEntry[];
}

/** docs/DESIGN.md §8, the signature element: a monospace running record, one line per move. */
export function MoveLedger({ entries }: MoveLedgerProps) {
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
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h2
        style={{
          margin: '0 0 var(--pad-sm) 0',
          fontSize: 'var(--fs-micro)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Moves
      </h2>
      {entries.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-meta)' }}>No moves yet.</p>
      ) : (
        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            overflowY: 'auto',
            fontSize: 'var(--fs-meta)',
          }}
        >
          {entries.map((entry) => {
            const row = formatLedgerRow(entry);
            return (
              <li
                key={row.index}
                style={{
                  display: 'flex',
                  gap: 'var(--gap-sm)',
                  padding: '2px 0',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
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
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
