import type { IntegerVariant } from '@damath/engine';

interface RailProps {
  variants: readonly IntegerVariant[];
  current: IntegerVariant;
  onNewGame: (variant: IntegerVariant) => void;
}

export function Rail({ variants, current, onNewGame }: RailProps) {
  return (
    <nav
      aria-label="Match settings"
      style={{
        width: 'var(--rail-width)',
        background: 'var(--surface-rail)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--pad-lg) var(--pad-md)',
        gap: 'var(--gap-lg)',
      }}
    >
      <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, letterSpacing: '-0.01em' }}>Damath</div>

      <div>
        <div
          style={{
            fontSize: 'var(--fs-micro)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--border)',
            paddingTop: 'var(--pad-lg)',
            marginBottom: 'var(--pad-sm)',
          }}
        >
          Variant
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {variants.map((variant) => {
            const active = variant.id === current.id;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => onNewGame(variant)}
                aria-current={active}
                style={{
                  textAlign: 'left',
                  padding: 'var(--pad-sm) var(--pad-md)',
                  borderRadius: 'var(--radius)',
                  border: active ? '1px solid rgba(227, 179, 65, 0.4)' : '1px solid transparent',
                  background: active ? 'var(--accent-bg)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 'var(--fs-body)',
                  cursor: 'pointer',
                }}
              >
                {variant.name}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNewGame(current)}
        style={{
          marginTop: 'auto',
          background: 'var(--accent)',
          color: 'var(--accent-on)',
          border: 'none',
          borderRadius: 'var(--radius)',
          padding: 'var(--pad-sm) var(--pad-md)',
          fontSize: 'var(--fs-label)',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        New match
      </button>

      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-disabled)' }}>[BUILD: 0.1.0]</div>
    </nav>
  );
}
