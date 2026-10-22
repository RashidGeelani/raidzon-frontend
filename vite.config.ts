import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';
import type { Connect, Plugin } from 'vite';

// The home page opens the scoring app: preload its code together with the page instead of after the first
// script runs (one round trip less). api/page.js strips these hints from public pages, which don't need the app.
const preloadApp: Plugin = {
  name: 'preload-app',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, { bundle }) {
      if (!bundle) return html;
      const app = Object.values(bundle).find((c) => c.type === 'chunk' && /[\/]src[\/]app[\/]App\.tsx$/.test(c.facadeModuleId ?? ''));
      if (!app) return html;
      const files = new Set<string>();
      const visit = (name: string) => {
        const chunk = bundle[name];
        if (files.has(name) || chunk?.type !== 'chunk') return;
        files.add(name);
        chunk.imports.forEach(visit);
      };
      visit(app.fileName);
      const tags = [...files].filter((file) => !html.includes(file)).map((file) => `<link rel="modulepreload" crossorigin href="/${file}" data-app-preload>`);
      return html.replace('</head>', `  ${tags.join('\n    ')}\n  </head>`);
    },
  },
};

// Vercel serves /guide/x from public/guide/x.html ("cleanUrls" in vercel.json); do the same in dev and preview.
const guideUrls: Connect.NextHandleFunction = (req, _res, next) => {
  const [path, query] = (req.url ?? '').split('?');
  if (/^\/guide(\/[a-z0-9-]+)?\/?$/.test(path)) req.url = `${path === '/guide' || path === '/guide/' ? '/guide/index' : path.replace(/\/$/, '')}.html${query ? `?${query}` : ''}`;
  next();
};

export default defineConfig({
  // Shown in the app so a user can tell which release they are on. Bump "version" in package.json per release.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    preloadApp,
    { name: 'guide-clean-urls', configureServer: (server) => { server.middlewares.use(guideUrls); }, configurePreviewServer: (server) => { server.middlewares.use(guideUrls); } },
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
        // Offline, only the app's own pages open from the cache; any other address goes to the server (a real 404).
        navigateFallbackAllowlist: [/^\/(\?.*)?$/, /^\/(help|privacy)(\?.*)?$/, /^\/(watch|scorecard|tournaments|players|overlay)\/[0-9a-f-]{36}(\?.*)?$/i],
        navigateFallbackDenylist: [/^\/api\//, /^\/(robots|llms)\.txt$/, /^\/sitemap\.xml$/],
      },
    }),
  ],
});
