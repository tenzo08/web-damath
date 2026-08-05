import type { ReactNode } from 'react';
import type { AnyVariant } from '@damath/engine';

interface RailProps {
  variants: readonly AnyVariant[];
  current: AnyVariant;
  onSelectVariant: (variant: AnyVariant) => void;
  onNewGame: () => void;
}

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
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
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function RailTip({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

const ELEMENTARY_IDS = new Set(['counting', 'whole', 'fraction']);

export function Rail({ variants, current, onSelectVariant, onNewGame }: RailProps) {
  const elementary = variants.filter((v) => ELEMENTARY_IDS.has(v.id));
  const secondary = variants.filter((v) => !ELEMENTARY_IDS.has(v.id));

  const variantButton = (variant: AnyVariant) => {
    const active = variant.id === current.id;
    return (
      <button
        key={variant.id}
        type="button"
        onClick={() => onSelectVariant(variant)}
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
        <div>{variant.name}</div>
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>{variant.gradeLevel}</div>
      </button>
    );
  };

  return (
    <nav
      aria-label="Match settings"
      style={{
        width: 'var(--rail-width)',
        flexShrink: 0,
        background: 'var(--surface-rail)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--pad-lg) var(--pad-md)',
        gap: 'var(--gap-lg)',
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, letterSpacing: '-0.01em' }}>Damath</div>

      <RailSection title="Elementary">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{elementary.map(variantButton)}</div>
      </RailSection>

      <RailSection title="Secondary">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{secondary.map(variantButton)}</div>
      </RailSection>

      <RailSection title="How to play">
        <RailTip>Capturing is mandatory whenever it's available.</RailTip>
        <RailTip>The board always shows the maximum-length capture — take fewer chips isn't legal if more is available.</RailTip>
        <RailTip>Score comes from the operation on the square you land on, not the one you started from.</RailTip>
        <RailTip>Reach the far row to promote to a Dama — it can then move and capture any distance.</RailTip>
      </RailSection>

      <RailSection title="Keyboard">
        <RailTip>Arrow keys move the board cursor.</RailTip>
        <RailTip>Enter selects a piece, then confirms a move.</RailTip>
        <RailTip>Escape clears the current selection.</RailTip>
      </RailSection>

      <button
        type="button"
        onClick={onNewGame}
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
