const CACHE_NAME = 'ipodfolio-v52';
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
  '/js/music-library.js',
  '/js/qrcode-lib.js',
  '/js/qr-overlay.js',
  '/js/tutorial-overlay.js',
  '/js/studio-grid.js',
  '/js/views.js',
  '/js/touchscreen.js',
  '/img/adobe-cover.jpg',
  '/img/dj-cover.jpg',
  '/img/games-preview.jpg',
  '/img/headphones-cover.jpg',
  '/img/music-preview.jpg',
  '/img/projects-preview.jpg',
  '/img/apple-logo-black.png',
  '/favicon.svg',
  '/favicon-32.png'
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

// --- Routing helpers ---
function isImageRequest(url) {
  // Supabase storage images, or any image file extension
  if (url.includes('supabase.co/storage/')) return true;
  if (/\.(jpg|jpeg|png|webp|gif|svg|avif|ico)(\?|$)/i.test(url)) return true;
  return false;
}

function isAPIRequest(url) {
  // Supabase REST API or CMS API
  if (url.includes('supabase.co/rest/')) return true;
  if (url.includes('ipodfolio-cms.vercel.app/api/')) return true;
  return false;
}

function isAudioRequest(url) {
  if (url.includes('supabase.co/storage/') && /\.(mp3|m4a|wav|ogg|aac)(\?|$)/i.test(url)) return true;
  return false;
}

// Fetch — smart caching strategy per content type
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Audio files: never cache (too large, streaming is fine)
  if (isAudioRequest(url)) return;

  // Images: cache-first (serve from cache instantly, update in background)
  if (isImageRequest(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          // Kick off background fetch to refresh cache
          const networkFetch = fetch(event.request).then((response) => {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => null);

          // Return cached immediately, or wait for network
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // API data: stale-while-revalidate (serve cached, refresh in background)
  if (isAPIRequest(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((response) => {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);

          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Shell assets and everything else: network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
