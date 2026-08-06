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
}

export function MiniSquareView({ operation, piece, highlight, playable = true, badge }: MiniSquareSpec) {
  if (!playable) {
    return <div style={{ background: 'var(--square-void)', aspectRatio: '1' }} />;
  }
  let background = 'var(--square-play)';
  if (highlight === 'legal') background = 'var(--square-legal)';
  else if (highlight === 'last') background = 'var(--square-last)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: '1',
        position: 'relative',
        background,
        boxShadow: highlight === 'selected' ? 'inset 0 0 0 2px var(--accent)' : undefined,
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

export function MiniBoard({
  rows,
  size = 220,
  label,
}: {
  rows: (MiniSquareSpec | null)[][];
  size?: number | undefined;
  label?: string | undefined;
}) {
  const cols = rows[0]?.length ?? 0;
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--gap-sm)' }}>
      <div
        role="img"
        aria-label={label ?? 'board diagram'}
        style={{
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
      </div>
      {label && <figcaption style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', textAlign: 'center' }}>{label}</figcaption>}
    </figure>
  );
}
