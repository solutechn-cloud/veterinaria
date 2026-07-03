import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      // "prompt": el SW nuevo queda en espera y la app muestra un banner
      // "Nueva version disponible"; se aplica solo cuando el usuario confirma.
      registerType: 'prompt',
      // El registro lo maneja el hook useRegisterSW (components/PwaUpdatePrompt),
      // por eso no auto-inyectamos el script de registro.
      injectRegister: false,
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-192.png',
        'icons/icon-maskable-512.png',
        'apple-touch-icon.png',
        'favicon-32.png',
        'favicon-16.png'
      ],
      manifest: {
        name: 'VetiCloud',
        short_name: 'VetiCloud',
        description: 'VetiCloud - Gestion veterinaria en la nube',
        theme_color: '#4a90c2',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'any',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Pre-cachear todos los assets estaticos
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
        // El logo fuente no se referencia en runtime; sigue disponible en
        // /veticloud.png pero no se precachea para no inflar la instalacion.
        globIgnores: ['**/veticloud.png'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // En modo "prompt" el SW nuevo NO hace skipWaiting automatico: espera a
        // que el usuario confirme desde el banner. Al activarse, limpia las
        // cachES obsoletas para no seguir sirviendo modulos viejos.
        cleanupOutdatedCaches: true,
        // /api/* is intentionally excluded from service-worker caching — the app
        // manages its own tenant-scoped offline cache via IndexedDB (offlineDB).
        // Caching authenticated API responses in the SW would leak tenant data
        // across sessions on shared devices.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.tailwindcss\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tailwind-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-static',
              expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    https: false, // Set to true if you have SSL certs for LAN HTTPS (required for permanent camera permissions on non-localhost)
    host: process.env.VITE_HOST || 'localhost', // Set VITE_HOST=0.0.0.0 to expose on LAN (dev only)
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
});
