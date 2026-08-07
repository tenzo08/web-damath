import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia — useMediaQuery (Rail.tsx's responsive collapse)
// needs it. Every test runs at the "wide" layout unless a test overrides `matches`.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  cleanup();
  // Real localStorage writes now happen in tests (auth token, locale preference) —
  // without this, one test's localStorage state leaks into the next render(<App />).
  localStorage.clear();
  // Same leak, for the browser history App.tsx's client-side routing now pushes real
  // entries onto — jsdom's `window.location`/`history` are shared across every test in
  // a file, not reset per test. Without this, a test that navigated to e.g. /game left
  // the *next* test's fresh `render(<App />)` reading that same path back on mount,
  // starting it on the wrong screen instead of the lobby.
  window.history.replaceState(null, '', '/');
});

