import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'GameNight',
        short_name: 'GameNight',
        description: 'Create a private table and play party games with friends.',
        theme_color: '#16382d',
        background_color: '#16382d',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only — cache the built JS/CSS/HTML/icons/fonts so the game
        // opens instantly. The real-time layer is deliberately left to the
        // network: never serve socket.io or the health check from the cache.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,ttf}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/socket\.io\//, /^\/healthz$/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(dirname, '../shared/src'),
    },
  },
  server: {
    proxy: {
      '/socket.io': {
        // 127.0.0.1 (not localhost) sidesteps IPv6-first resolution surprises.
        target: 'http://127.0.0.1:3001',
        ws: true,
        configure(proxy) {
          // The backend briefly goes down on every tsx-watch restart while a
          // browser tab keeps retrying — one quiet line beats a stack trace.
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            console.log(`[proxy] game server not ready yet (${err.code ?? err.message}) — retrying`);
          });
        },
      },
    },
  },
});
