const CACHE_NAME = 'sigilo-v4';
const assets = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/clerk-init.js',
  '/site.webmanifest',
  '/favicon-96x96.png',
  '/apple-touch-icon.png'
];

// Al instalar: llenar caché nueva y activar inmediatamente
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(assets))
  );
});

// Al activar: borrar cachés viejas y tomar control de todas las páginas abiertas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Network First para HTML, JS y CSS — siempre intenta red primero
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // No interceptar peticiones a APIs externas (Supabase, CDNs de fuentes, etc.)
  if (url.origin !== self.location.origin) return;

  // No interceptar llamadas al proxy de base de datos — siempre van a la red
  if (url.pathname.startsWith('/api/')) return;

  const isDocument = req.destination === 'document';
  const isScript   = req.destination === 'script';
  const isStyle    = req.destination === 'style';

  if (isDocument || isScript || isStyle) {
    // Network First: intenta red, guarda en caché, cae a caché si falla
    event.respondWith(
      fetch(req)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return response;
        })
        .catch(() => caches.match(req))
    );
  } else {
    // Cache First para imágenes y otros assets estáticos
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return response;
        });
      })
    );
  }
});
