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
        description: 'Courtside kabaddi scoring. Ready offline.',
        theme_color: '#0e0e1c',
        background_color: '#0e0e1c',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/brand/raidzon-logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/raidzon-logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // The full-resolution source logo is not needed in the app; small copies are precached instead.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico}'],
        globIgnores: ['brand/raidzon-logo.png'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
