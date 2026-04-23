const CACHE_NAME = 'ipodfolio-v73';
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
  '/assets/cursor-hand.png',
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

  // Images: cache-first (serve from cache instantly, update in background).
  // If there is no cached copy, race the network against a 6s timeout so a
  // hung request doesn't block the <img> forever — letting onerror kick in
  // and trigger our retry/fallback logic in views.js.
  if (isImageRequest(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((response) => {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => null);

          if (cached) {
            // Return cached immediately; network refresh runs in background.
            return cached;
          }

          // Race network against a 6s timeout to avoid hung requests.
          return new Promise((resolve) => {
            let done = false;
            const timer = setTimeout(() => {
              if (done) return;
              done = true;
              // Hand back a 504 so the <img> fires onerror cleanly.
              resolve(new Response('', { status: 504, statusText: 'Image timeout' }));
            }, 6000);
            networkFetch.then((resp) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve(resp || new Response('', { status: 504, statusText: 'Image fetch failed' }));
            });
          });
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
