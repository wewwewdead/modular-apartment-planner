import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.woff2', 'favicon.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\./,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
        ],
      },
      manifest: {
        name: 'Modular Apartment Planner',
        short_name: 'Apartment Planner',
        description:
          'Free browser-based architectural floorplan editor with 3D walkthrough and CNC-ready workshop exports. Works offline.',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1a1a2e',
        theme_color: '#d4856b',
        categories: ['productivity', 'utilities', 'design'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Floorplan Editor', url: '/floorplan', description: 'Open the floorplan workspace' },
          { name: 'Craftsman Studio', url: '/sketch', description: 'Open the Craftsman Studio workspace' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.claude/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three-vendor';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@floorplan': fileURLToPath(new URL('./src/features/floorplan', import.meta.url)),
    },
  },
});
