import { useEffect, useState } from 'react';

/**
 * True while the browser reports network connectivity — `navigator.onLine`, kept live
 * via the `online`/`offline` window events. Used to show an explicit "you're offline"
 * banner (OfflineBanner.tsx) instead of letting a PWA-cached response (vite.config.ts's
 * `runtimeCaching`) render silently with no indication the data might be stale.
 * `navigator.onLine` itself is a coarse signal (it only reflects the network
 * interface, not whether apps/server specifically is reachable) but a false positive
 * here just means an occasional missing banner, not a broken page — good enough for
 * "tell the viewer when they're probably looking at cached data."
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}
