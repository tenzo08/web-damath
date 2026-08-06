import { useState, type ReactNode } from 'react';
import type { AnyVariant } from '@damath/engine';

interface RailProps {
  variants: readonly AnyVariant[];
  current: AnyVariant;
  onSelectVariant: (variant: AnyVariant) => void;
  onNewGame: () => void;
  onOpenTutorial: () => void;
  onBackToLobby: () => void;
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
          marginBottom: 'var(--pad-sm)',
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

const ELEMENTARY_IDS = new Set(['counting', 'whole', 'fraction']);

function HamburgerIcon() {
  return (
    <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 16 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ height: 2, background: 'currentColor', borderRadius: 1 }} />
      ))}
    </span>
  );
}

/** docs/DESIGN.md-adjacent decision: the seven-variant list used to be printed in full at
 * all times, which was most of what made the rail feel oversized. Collapsed behind a
 * single hamburger button that expands a picker — same information, on demand. */
export function Rail({ variants, current, onSelectVariant, onNewGame, onOpenTutorial, onBackToLobby }: RailProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const elementary = variants.filter((v) => ELEMENTARY_IDS.has(v.id));
  const secondary = variants.filter((v) => !ELEMENTARY_IDS.has(v.id));

  const variantButton = (variant: AnyVariant) => {
    const active = variant.id === current.id;
    return (
      <button
        key={variant.id}
        type="button"
        onClick={() => {
          onSelectVariant(variant);
          setMenuOpen(false);
        }}
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
        gap: 'var(--gap-md)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
        <button
          type="button"
          onClick={onBackToLobby}
          aria-label="Back to lobby"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 'var(--fs-title)', cursor: 'pointer', padding: '0 2px' }}
        >
          ←
        </button>
        <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, letterSpacing: '-0.01em' }}>Damath</div>
      </div>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--gap-sm)',
            textAlign: 'left',
            padding: 'var(--pad-sm) var(--pad-md)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--surface-panel)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <HamburgerIcon />
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>{current.gradeLevel}</div>
          </span>
        </button>

        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                zIndex: 20,
                background: 'var(--surface-raised)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--pad-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--gap-md)',
                maxHeight: '60vh',
                overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <RailSection title="Elementary">{elementary.map(variantButton)}</RailSection>
              <RailSection title="Secondary">{secondary.map(variantButton)}</RailSection>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onNewGame}
        style={{
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

      <button
        type="button"
        onClick={onOpenTutorial}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 'var(--pad-sm) var(--pad-md)',
          fontSize: 'var(--fs-label)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--gap-sm)',
        }}
      >
        <span aria-hidden="true">❓</span> How to play
      </button>

      <div style={{ marginTop: 'auto', fontSize: 'var(--fs-meta)', color: 'var(--text-disabled)' }}>[BUILD: 0.1.0]</div>
    </nav>
  );
}
