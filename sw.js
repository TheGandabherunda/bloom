const CACHE_NAME = 'bloom-pwa-cache-v1';

// Add the core files to cache so the app can load offline and meet PWA requirements
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './tailwind.config.js',
  './js/state.js',
  './js/peer.js',
  './js/search.js',
  './js/media.js',
  './js/chat.js',
  './js/app.js',
  './assets/Bloom.svg'
];

// Install event - caches the static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - cleans up old caches if we update the CACHE_NAME
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first strategy, falling back to cache
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Don't cache API calls or external domains unnecessarily, focus on local assets
  if (!event.request.url.startsWith(self.location.origin)) {
      return;
  }

  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});