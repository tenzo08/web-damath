import type { Piece as PieceModel } from '@damath/engine';

interface PieceProps<V> {
  piece: PieceModel<V>;
  format: (value: V) => string;
}

/** docs/DESIGN.md §3: filled circle, value in the matching -on color, Dama is a ring (never a crown), plus a subtle inner border so ownership never relies on hue alone. */
export function Piece<V>({ piece, format }: PieceProps<V>) {
  const isLight = piece.owner === 'white';
  const fill = isLight ? 'var(--piece-light)' : 'var(--piece-dark)';
  const onColor = isLight ? 'var(--piece-light-on)' : 'var(--piece-dark-on)';
  const label = format(piece.value);
  // Non-integer variants can print long labels ("-11/10", "36x²y") — shrink to fit
  // rather than overflow the circle. Plain digits (the integer variants) stay full size.
  const fontSize = label.length <= 2 ? 'var(--fs-body)' : label.length <= 4 ? 'var(--fs-meta)' : 'var(--fs-micro)';

  return (
    <span
      style={{
        position: 'relative',
        width: '72%',
        height: '72%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {piece.isDama && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: '50%',
            border: `2px solid ${fill}`,
          }}
        />
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
          fontSize,
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
