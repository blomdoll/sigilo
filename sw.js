const CACHE_NAME = 'sigilo-v1';
const assets = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/site.webmanifest',
  '/favicon-96x96.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
