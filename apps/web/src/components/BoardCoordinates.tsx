import type { ReactNode } from 'react';

interface BoardCoordinatesProps {
  /** Row numbers top-to-bottom, in the same flip-aware order the board itself iterates — each label always names the true engine row of whatever's rendered at that visual slot, so the same physical square carries the same number no matter which side the board is currently drawn from. */
  rows: readonly number[];
  /** Column numbers left-to-right, same flip-aware-but-absolute convention as `rows`. */
  cols: readonly number[];
  maxWidth: string;
  children: ReactNode;
}

const GUTTER = '1.4em';

/**
 * Wraps a board grid with a row-number gutter down the left and a column-number strip
 * along the bottom — coordinates.txt's `row,col` convention, not chess algebraic. Pure
 * layout: the wrapped grid keeps its own square-aspect sizing, this just adds label
 * strips around it and moves the width cap here so the whole figure (labels included)
 * still fits the same space the bare grid used to.
 */
export function BoardCoordinates({ rows, cols, maxWidth, children }: BoardCoordinatesProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth }}>
      <div style={{ display: 'flex', width: '100%' }}>
        <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', width: GUTTER, flexShrink: 0 }}>
          {rows.map((r, i) => (
            <span
              key={`${String(r)}-${String(i)}`}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}
            >
              {r}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
      <div style={{ display: 'flex', width: '100%' }}>
        <div aria-hidden="true" style={{ width: GUTTER, flexShrink: 0 }} />
        <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
          {cols.map((c, i) => (
            <span key={`${String(c)}-${String(i)}`} style={{ flex: 1, textAlign: 'center', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
