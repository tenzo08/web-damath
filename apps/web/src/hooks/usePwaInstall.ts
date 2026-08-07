import { useEffect, useState } from 'react';

/** The event shape Chromium browsers fire — not in lib.dom.d.ts (still non-standard), so hand-typed here rather than pulling in a whole extra `@types` package for one event. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Wraps the browser's own PWA install flow (`beforeinstallprompt`) — the app shell is
 * already installable (vite-plugin-pwa's manifest + service worker, Milestone 6), this
 * is just a real "Install" button instead of relying on a visitor noticing their
 * browser's own address-bar icon. The event only fires on Chromium-based browsers that
 * haven't already decided the app isn't installable or is already installed; Safari/
 * Firefox never fire it at all, so `canInstall` simply stays `false` there and no button
 * renders — no separate feature-detection needed, the event's absence already tells the
 * whole story.
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    // A used prompt can't be reused — the browser only ever fires beforeinstallprompt
    // again for a genuinely fresh install opportunity (e.g. after a manual uninstall).
    setDeferredPrompt(null);
  }

  return { canInstall: deferredPrompt !== null && !installed, promptInstall };
}
