/**
 * BiharFast Service Worker (sw.js)
 * High-performance Cache-First offline caching strategy.
 *
 * Ensures BiharFast Photo & Doc Studio and core platform assets
 * work 100% offline without internet connection.
 */

const CACHE_NAME = 'biharfast-studio-v3';

// Core assets to pre-cache on Service Worker installation
const ASSETS = [
  './',
  './index.html',
  './tools/studio.html',
  './tools/image-compressor-20kb.html',
  './tools/passport-photo-maker.html',
  './tools/jpg-to-pdf-200kb.html',
  './tools/photo-name-date-stamp.html',
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

// Fetch Event: Cache-First Strategy for same-origin assets.
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') return;
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isAsset = ['style', 'script', 'image'].includes(event.request.destination) ||
    /\.(?:css|js|png|jpe?g|gif|webp|svg|ico)$/i.test(requestUrl.pathname);
  if (!isAsset) return;

  event.respondWith((async () => {
    let cachedResponse;
    try {
      cachedResponse = await caches.match(event.request, { ignoreSearch: true });
    } catch (error) {
      console.warn(`[BiharFast SW] Asset cache lookup failed: ${event.request.url}`, error);
    }
    if (cachedResponse && !cachedResponse.redirected) return cachedResponse;

    let response;
    try {
      response = await fetch(event.request);
      if (response.redirected) response = await fetch(response.url);
    } catch (error) {
      console.warn(`[BiharFast SW] Asset request failed: ${event.request.url}`, error);
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }

    if (response.redirected) {
      return new Response('Asset redirect rejected', {
        status: 502,
        statusText: 'Bad Gateway'
      });
    }

    if (response.status === 200) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      } catch (error) {
        console.warn(`[BiharFast SW] Asset cache write failed: ${event.request.url}`, error);
      }
    }
    return response;
  })());
});
