import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
