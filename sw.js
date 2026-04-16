const CACHE_NAME = 'ipodfolio-v38';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/audio-player.js',
  '/js/brick-game.js',
  '/js/clickwheel.js',
  '/js/cover-flow.js',
  '/js/data.js',
  '/js/qrcode-lib.js',
  '/js/qr-overlay.js',
  '/js/tutorial-overlay.js',
  '/js/studio-grid.js',
  '/js/views.js',
  '/img/adobe-cover.jpg',
  '/img/dj-cover.jpg',
  '/img/games-preview.jpg',
  '/img/headphones-cover.jpg',
  '/img/music-preview.jpg',
  '/img/projects-preview.jpg'
];

// Install — cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Only handle http/https requests (skip chrome-extension://, etc.)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
