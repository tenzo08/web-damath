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

// jsdom doesn't implement `Worker` at all -- `useComputerOpponent`/`useGameReview`
// construct one in an effect the instant it's the computer's turn, which can now
// happen immediately on mount (GameShell randomizes which color the computer plays,
// instead of always seating it Black behind the human's own guaranteed-first move).
// A no-op stub is enough: no test in this suite asserts on an actual bot reply arriving
// (that would need a real minimax search, which is exactly why it runs in a worker
// instead of on the render thread) -- `postMessage`/`terminate` simply do nothing and
// `onmessage` is never invoked.
if (typeof Worker === 'undefined') {
  class NoopWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage(): void {
      // intentionally inert -- see comment above
    }
    terminate(): void {
      // intentionally inert -- see comment above
    }
    addEventListener(): void {
      // intentionally inert -- see comment above
    }
    removeEventListener(): void {
      // intentionally inert -- see comment above
    }
  }
  // @ts-expect-error -- test-only stub, not a spec-complete Worker
  globalThis.Worker = NoopWorker;
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

