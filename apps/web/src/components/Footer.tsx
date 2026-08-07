/**
 * A persistent footer: just the creator credit. Omitted during locked-scroll gameplay
 * screens (App.tsx) — those deliberately fit the board to one viewport height with no
 * page scroll, and a footer would either get clipped or force the exact scrolling that
 * layout exists to avoid.
 */
export function Footer() {
  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--pad-md) var(--pad-lg)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>Built by Raphael Lizarde</span>
    </footer>
  );
}
