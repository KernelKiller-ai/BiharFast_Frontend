/**
 * BiharFast Service Worker (sw.js)
 * High-performance Cache-First offline caching strategy.
 *
 * Ensures BiharFast Photo & Doc Studio and core platform assets
 * work 100% offline without internet connection.
 */

const CACHE_NAME = 'biharfast-studio-v2';

// Core assets to pre-cache on Service Worker installation
const ASSETS = [
  './',
  './index.html',
  './tools/studio.html',
  './tools/studio',
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
// Using Promise.allSettled so a single failed asset path never breaks Service Worker installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn(`[BiharFast SW] Failed to cache: ${url}`, err);
          });
        })
      );
    }).then(() => {
      // Activate immediately without waiting for existing tabs to close
      return self.skipWaiting();
    })
  );
});

// Activate Event: Delete all older caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log(`[BiharFast SW] Deleting older cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch Event: Cache-First Strategy with Background Cache Updates
// Only intercept same-origin GET requests; wrap in a fallback so respondWith() NEVER causes ERR_FAILED
self.addEventListener('fetch', (event) => {
  // Only intercept same-origin GET requests
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return instantly from cache (Cache-First)
          return cachedResponse;
        }

        // If not in cache, fetch from network and dynamically cache valid response
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Fallback to direct network fetch if cache matching fails
        return fetch(event.request);
      })
      .catch(() => {
        // If both cache and network fail (completely offline)
        if (event.request.mode === 'navigate') {
          if (requestUrl.pathname.includes('/tools/') || requestUrl.pathname.includes('studio')) {
            return caches.match('/tools/studio.html')
              .then((res) => res || caches.match('./tools/studio.html'))
              .then((res) => res || caches.match('/tools/studio'));
          }
          return caches.match('/index.html')
            .then((res) => res || caches.match('./index.html'))
            .then((res) => res || caches.match('/'));
        }
        // Fallback Response instead of rejecting to prevent Chrome ERR_FAILED
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
