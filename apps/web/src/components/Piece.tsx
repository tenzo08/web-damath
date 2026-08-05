import type { Piece as PieceModel } from '@damath/engine';

interface PieceProps {
  piece: PieceModel;
}

/** docs/DESIGN.md §3: filled circle, value in the matching -on color, Dama is a ring (never a crown), plus a subtle inner border so ownership never relies on hue alone. */
export function Piece({ piece }: PieceProps) {
  const isLight = piece.owner === 'white';
  const fill = isLight ? 'var(--piece-light)' : 'var(--piece-dark)';
  const onColor = isLight ? 'var(--piece-light-on)' : 'var(--piece-dark-on)';

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
          fontSize: 'var(--fs-body)',
          color: onColor,
        }}
      >
        {piece.value}
      </span>
    </span>
  );
}
