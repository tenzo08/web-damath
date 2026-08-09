/** Same visual treatment OnlineGameScreen's own "reconnecting" notice uses — a warning-bordered status strip, not a hard error. Shown whenever `useOnlineStatus` reports the browser is offline, on any screen that might be rendering a PWA-cached (vite.config.ts) response instead of a live one. */
export function OfflineBanner() {
  return (
    <div
      role="status"
      style={{
        width: '100%',
        background: 'var(--surface-panel)',
        border: '1px solid var(--warning, var(--border))',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--pad-sm) var(--pad-md)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--fs-meta)',
      }}
    >
      📡 You're offline — showing the last synced data.
    </div>
  );
}
