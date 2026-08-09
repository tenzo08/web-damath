import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Repo-root `dist/`, not the Vite default of `apps/web/dist` — Vercel's dashboard
  // Output Directory setting (auto-filled to a plain "dist" by its Vite framework
  // preset when the project was first created) overrides vercel.json#outputDirectory
  // silently, and a real deploy failed twice looking for exactly this path. Matching it
  // here is more robust than depending on someone finding and clearing a dashboard
  // toggle on every fresh Vercel project. `emptyOutDir: true` because the target is
  // outside Vite's own project root (apps/web), which it otherwise refuses to clean
  // automatically.
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  // `useComputerOpponent`/`useGameReview` spin up `new Worker(new URL('./ai-worker-entry.ts',
  // import.meta.url), { type: 'module' })` -- an ES module worker that itself imports
  // @damath/ai, so Rollup needs to code-split its bundle. Vite's own default worker
  // output format is 'iife', and Rollup refuses iife/UMD together with code-splitting
  // ("UMD and IIFE output formats are not supported for code-splitting builds") --
  // harmless in dev (esbuild, not this config) but a hard production build failure.
  // 'es' matches the `{ type: 'module' }` the worker is already constructed with.
  worker: {
    format: 'es',
  },
  plugins: [
    react(),
    // docs/PLANNING.md: "Connectivity in Philippine schools is uneven; this is a real
    // requirement, not a nice-to-have." Caches the app shell so local hot-seat play and
    // practice-vs-computer (both fully client-side — the AI runs in a Web Worker) work
    // with no network at all after the first load. Online play/tournaments/sign-in
    // still need the server and fail gracefully when it's unreachable — see
    // useOnlineGame.ts, already built to handle that.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Damath',
        short_name: 'Damath',
        description: 'Dama + Mathematics — the Filipino educational board game.',
        theme_color: '#0f0f12',
        background_color: '#0f0f12',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
