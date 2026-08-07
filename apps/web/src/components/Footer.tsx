import { usePwaInstall } from '../hooks/usePwaInstall';

const footerButton = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-secondary)',
  fontSize: 'var(--fs-micro)',
  padding: '4px 10px',
  cursor: 'pointer',
  textDecoration: 'none',
} as const;

/**
 * A persistent footer: install-to-home-screen (usePwaInstall), a sideload APK download
 * (Android only — the practical free option; a Play Store listing needs a paid
 * developer account, see apps/twa/README.md), and a plain creator credit. Omitted during
 * locked-scroll gameplay screens (App.tsx) — those deliberately fit the board to one
 * viewport height with no page scroll, and a footer would either get clipped or force
 * the exact scrolling that layout exists to avoid.
 */
export function Footer() {
  const { canInstall, promptInstall } = usePwaInstall();

  return (
    <footer
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--gap-sm)',
        padding: 'var(--pad-md) var(--pad-lg)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {canInstall && (
        <button type="button" onClick={() => void promptInstall()} style={footerButton}>
          📲 Install app
        </button>
      )}
      {/* Rebuilt automatically on every push to main (.github/workflows/build-apk.yml)
          and published as the repo's "latest" GitHub Release — a plain download link,
          not a store listing, since this is sideload-only. A 404 here just means that
          workflow hasn't been enabled yet (apps/twa/README.md's one-time setup). */}
      <a href="https://github.com/tenzo08/web-damath/releases/download/latest/damath.apk" download style={footerButton}>
        🤖 Download for Android (APK)
      </a>
      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>Built by Raphael Lizarde</span>
    </footer>
  );
}
