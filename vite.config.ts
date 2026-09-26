import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8080' } },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['brand/raidzon-logo.png'],
      manifest: {
        name: 'raidzOn',
        short_name: 'raidzOn',
        description: 'Courtside kabaddi scoring. Ready offline.',
        theme_color: '#14281f',
        background_color: '#f5f4ee',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/brand/raidzon-logo.png', sizes: '1254x1254', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
