import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['models/manifest.json'],
        manifest: {
          id: '/',
          name: 'Closetly — Closet Digital',
          short_name: 'Closetly',
          description:
            'Digitaliza tu ropa, organiza tu closet virtual y arma outfits sobre tu avatar 2D.',
          theme_color: '#FFFBFD',
          background_color: '#FFFBFD',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          lang: 'es',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}'],
          globIgnores: ['**/*.wasm', '**/mediapipe/**'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/__\/auth/, /^\/api\//],
          cleanupOutdatedCaches: true,
          // NOTA: NO cachear firestore.googleapis.com con Workbox.
          // El offline de datos lo gestiona Firestore (persistentLocalCache + persistentMultipleTabManager).
          runtimeCaching: [
            {
              urlPattern: /\/mediapipe\/.+\.(js|wasm|task)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'closetly-mediapipe-v1',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern:
                /^https:\/\/(firebasestorage\.googleapis\.com\/v0\/b\/|[^/]+\.firebasestorage\.app\/).*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'closetly-storage-images',
                expiration: {
                  maxEntries: 300,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
                plugins: [
                  {
                    cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
                      const url = new URL(request.url);
                      url.searchParams.delete('token');
                      return url.toString();
                    },
                  },
                ],
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/models\/.+\.(glb|gltf|bin|ktx2)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'closetly-3d-models-v1',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    worker: {
      format: 'es' as const,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
