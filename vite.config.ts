import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['brand/raidzon-logo-256.webp', 'brand/raidzon-logo-192.png'],
      manifest: {
        name: 'raidzOn',
        short_name: 'raidzOn',
        id: '/',
        description:
          'Score kabaddi matches raid by raid, run tournaments and follow live scores. Works offline courtside.',
        categories: ['sports'],
        lang: 'en',
        theme_color: '#0e0e1c',
        background_color: '#0e0e1c',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/brand/raidzon-logo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/brand/raidzon-logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        // Long-press the home-screen icon for these. The app reads ?action / ?tab on launch.
        shortcuts: [
          {
            name: 'Score a match',
            short_name: 'Score',
            url: '/?action=score',
            icons: [{ src: '/brand/raidzon-logo-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Tournaments',
            short_name: 'Tournaments',
            url: '/?tab=tournaments',
            icons: [{ src: '/brand/raidzon-logo-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'My matches',
            short_name: 'Matches',
            url: '/?tab=matches',
            icons: [{ src: '/brand/raidzon-logo-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        // Screenshots give Android the richer, store-like install sheet.
        screenshots: [
          {
            src: '/screenshots/home.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Your matches and followed tournaments',
          },
          {
            src: '/screenshots/scoring.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Score every raid with one tap',
          },
          {
            src: '/screenshots/tournament.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Fixtures, standings and leaders',
          },
          {
            src: '/screenshots/wide.png',
            sizes: '1920x1080',
            type: 'image/png',
            form_factor: 'wide',
            label: 'raidzOn on a laptop',
          },
        ],
      },
      workbox: {
        // Activate new versions as soon as they download so no phone stays on an old one; the app
        // decides when to reload (never in the middle of scoring) — see src/app/update-on-launch.ts.
        skipWaiting: true,
        clientsClaim: true,
        // The full-resolution source logo is not needed in the app; small copies are precached instead.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico}'],
        globIgnores: ['brand/raidzon-logo.png', 'screenshots/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
