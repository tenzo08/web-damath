import { useId } from 'react';

/**
 * A small, non-interactive board renderer shared by the tutorial's illustrative
 * diagrams and the online game screen's board (server sends pieces as pre-formatted
 * strings, not a full generic `GameState<V>` — see KNOWLEDGE.md, "online play sends a
 * formatted view, not typed state"). Deliberately lighter than the real `Board`/
 * `Square`/`Piece` trio: no keyboard nav, no generic `V`, just "draw this grid."
 */
export interface MiniPieceSpec {
  owner: 'white' | 'black';
  isDama?: boolean;
  label: string;
}

export function MiniPieceView({ owner, isDama, label }: MiniPieceSpec) {
  const isLight = owner === 'white';
  const fill = isLight ? 'var(--piece-light)' : 'var(--piece-dark)';
  const onColor = isLight ? 'var(--piece-light-on)' : 'var(--piece-dark-on)';
  return (
    <span style={{ position: 'relative', width: '72%', height: '72%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {isDama && (
        <span aria-hidden="true" style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: `2px solid ${fill}` }} />
      )}
      <span
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: fill,
          border: `1px solid color-mix(in srgb, ${onColor} 30%, transparent)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: label.length <= 2 ? 'var(--fs-body)' : label.length <= 4 ? 'var(--fs-meta)' : 'var(--fs-micro)',
          color: onColor,
          padding: '0 2px',
          overflow: 'hidden',
        }}
      >
        {label}
      </span>
    </span>
  );
}

export interface MiniSquareSpec {
  operation?: '+' | '−' | '×' | '÷' | null;
  piece?: MiniPieceSpec | null;
  highlight?: 'legal' | 'last' | 'selected' | null;
  playable?: boolean;
  /** A short caption drawn over the square corner — the tutorial uses this for step numbers/arrows ("1", "2", "→"). */
  badge?: string;
  /** Set only by an interactive caller (PuzzleScreen) — every other use of this component stays a static, non-interactive diagram. */
  onActivate?: (() => void) | undefined;
}

export function MiniSquareView({ operation, piece, highlight, playable = true, badge, onActivate }: MiniSquareSpec) {
  if (!playable) {
    return <div style={{ background: 'var(--square-void)', aspectRatio: '1' }} />;
  }
  let background = 'var(--square-play)';
  if (highlight === 'legal') background = 'var(--square-legal)';
  else if (highlight === 'last') background = 'var(--square-last)';

  return (
    <div
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={
        onActivate
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: '1',
        position: 'relative',
        background,
        boxShadow: highlight === 'selected' ? 'inset 0 0 0 2px var(--accent)' : undefined,
        cursor: onActivate ? 'pointer' : undefined,
      }}
    >
      {piece ? (
        <MiniPieceView {...piece} />
      ) : operation ? (
        <span aria-hidden="true" style={{ fontSize: 'var(--fs-title)', fontWeight: 500, color: 'var(--square-op)' }}>
          {operation}
        </span>
      ) : null}
      {badge && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: 4,
            fontSize: 'var(--fs-micro)',
            fontWeight: 700,
            color: 'var(--accent)',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

export interface MiniArrowSpec {
  from: { row: number; col: number };
  to: { row: number; col: number };
  /** A plain step (accent gold) vs. a capturing jump (danger red) — defaults to 'move'. */
  kind?: 'move' | 'capture';
}

export function MiniBoard({
  rows,
  size = 220,
  label,
  arrows,
}: {
  rows: (MiniSquareSpec | null)[][];
  size?: number | undefined;
  label?: string | undefined;
  /** Drawn as arrows overlaid on the grid, from square-center to square-center — the tutorial uses this to show the actual path a move or capture takes, not just the before/after squares. */
  arrows?: readonly MiniArrowSpec[] | undefined;
}) {
  const rowCount = rows.length;
  const cols = rows[0]?.length ?? 0;
  const markerIdBase = useId();
  const cellCenter = (r: number, c: number) => ({ x: ((c + 0.5) / cols) * 100, y: ((r + 0.5) / rowCount) * 100 });

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--gap-sm)' }}>
      <div
        role="img"
        aria-label={label ?? 'board diagram'}
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: `repeat(${String(cols)}, 1fr)`,
          width: size,
          maxWidth: '100%',
          aspectRatio: '1',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
        }}
      >
        {rows.flat().map((sq, i) => (
          <MiniSquareView key={i} {...(sq ?? { playable: false })} />
        ))}
        {arrows && arrows.length > 0 && (
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <defs>
              <marker id={`${markerIdBase}-move`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
              </marker>
              <marker id={`${markerIdBase}-capture`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--danger, #e35b5b)" />
              </marker>
            </defs>
            {arrows.map((a, i) => {
              const from = cellCenter(a.from.row, a.from.col);
              const to = cellCenter(a.to.row, a.to.col);
              const capture = a.kind === 'capture';
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={capture ? 'var(--danger, #e35b5b)' : 'var(--accent)'}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  markerEnd={`url(#${markerIdBase}-${capture ? 'capture' : 'move'})`}
                />
              );
            })}
          </svg>
        )}
      </div>
      {label && <figcaption style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', textAlign: 'center' }}>{label}</figcaption>}
    </figure>
  );
}
