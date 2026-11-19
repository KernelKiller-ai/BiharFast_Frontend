/**
 * BiharFast Service Worker (sw.js)
 * High-performance Cache-First offline caching strategy.
 *
 * Ensures BiharFast Photo & Doc Studio and core platform assets
 * work 100% offline without internet connection.
 */

const CACHE_NAME = 'biharfast-studio-v1';

// Core assets to pre-cache on Service Worker installation
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './tools/studio.html',
  './assets/css/style.css',
  './assets/css/studio.css',
  './assets/js/main.js',
  './assets/js/studio-core.js',
  './assets/js/kb-engine.js',
  './assets/js/pdf-engine.js',
  './assets/js/pdf-lib.min.js',
  './assets/js/pdf.min.js',
  './assets/js/pdf.worker.min.js',
  './assets/img/logo.png',
  './assets/img/og-banner.png'
];

// Install Event: Pre-cache all essential studio tools and offline libraries
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Add all core assets, silently handling any individual missing optional files
      return Promise.allSettled(
        PRECACHE_ASSETS.map((assetUrl) => {
          return cache.add(new Request(assetUrl, { cache: 'reload' })).catch((err) => {
            console.warn(`[BiharFast SW] Precache skipped for ${assetUrl}:`, err);
          });
        })
      );
    }).then(() => {
      // Activate immediately without waiting for previous tabs to close
      return self.skipWaiting();
    })
  );
});

// Activate Event: Clear outdated cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`[BiharFast SW] Removing legacy cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch Event: Cache-First Strategy with Background Cache Updates
self.addEventListener('fetch', (event) => {
  // Only handle GET HTTP(S) requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Return instantly from cache (Cache-First)
        return cachedResponse;
      }

      // If not in cache, fetch from network and cache it dynamically
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          // Cache clones of valid responses
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return networkResponse;
        })
        .catch(() => {
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            if (url.pathname.includes('/tools/') || url.pathname.includes('studio')) {
              return caches.match('./tools/studio.html') || caches.match('/tools/studio.html');
            }
            return caches.match('./index.html') || caches.match('/index.html');
          }
        });
    })
  );
});
