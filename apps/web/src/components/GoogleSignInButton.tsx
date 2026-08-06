import { useEffect, useRef } from 'react';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** Whether this build has a Google Client ID configured at all -- lets a caller (LoginModal) skip rendering an "or" divider above a button that won't actually appear. */
export const googleSignInConfigured = Boolean(GOOGLE_CLIENT_ID);

// Loaded lazily (only once a caller actually renders this component, i.e. the login
// modal is open) rather than in index.html, so signed-out visitors who never touch
// auth don't pay for a third-party script on every page load. Cached at module scope
// so mounting the button twice (e.g. Fast Refresh, or two modals) never double-loads it.
let scriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity-services]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityServices = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
}

/**
 * Google's own rendered "Sign in with Google" button (Google Identity Services), not a
 * custom-styled lookalike -- Google's terms require using their button, and it also
 * means this codebase never has to hand-roll the consent/account-picker UI. Renders
 * nothing at all when VITE_GOOGLE_CLIENT_ID isn't configured for this build (a
 * per-deployer setup step), rather than a disabled placeholder that implies a broken
 * feature.
 */
export function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => onCredentialRef.current(response.credential),
        });
        window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
      })
      .catch(() => {
        // Best-effort -- offline, blocked by an extension, whatever. Email/password
        // stays fully available either way; the button just never appears.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;

  return <div ref={containerRef} />;
}
