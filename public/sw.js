const CACHE_NAME = 'planet-talent-casting-v52';
const OFFLINE_URL = '/';
const CASTING_URL = '/casting';

const CORE_ASSETS = [
  '/',
  '/casting',
  '/bailarines',
  '/manifest.json',
  '/manifest-casting.json',
  '/favicon.svg',
  '/favicon.png',
  '/logo header.PNG',
  '/Logo de Planet Talent.PNG',
  '/logo_planet_talent.png',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/assets/aistudio/casting_flyer_top.jpg',
  '/assets/aistudio/casting_video_poster.jpg',
  '/assets/aistudio/casting_flyer_bailarines.jpg',
  '/assets/aistudio/casting_video_poster_bailarines.jpg',
];

async function cacheAppShellAndMedia(cache) {
  await Promise.allSettled(
    CORE_ASSETS.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (res.ok && res.status === 200) {
        await cache.put(url, res.clone());
      }
    })
  );

  // Precachear bundles JS/CSS de Vite descubiertos en el HTML inicial
  try {
    const htmlRes = await cache.match(OFFLINE_URL);
    if (htmlRes) {
      const html = await htmlRes.clone().text();
      const assetMatches = new Set();
      const assetRegex = /(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g;
      let match;
      while ((match = assetRegex.exec(html)) !== null) {
        assetMatches.add(match[1]);
      }
      await Promise.allSettled(
        Array.from(assetMatches).map(async (assetUrl) => {
          const res = await fetch(new Request(assetUrl, { cache: 'reload' }));
          if (res.ok && res.status === 200) {
            await cache.put(assetUrl, res);
          }
        })
      );
    }
  } catch {
    // ignore HTML parsing errors
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cacheAppShellAndMedia(cache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      )
    )
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // No cachear endpoints API ni interceptar streaming de video / peticiones Range (206 Partial Content)
  if (
    url.pathname.startsWith('/api/') ||
    event.request.headers.has('range') ||
    url.pathname.match(/\.(mp4|webm|mov|m4v)$/i)
  ) {
    return;
  }

  const isGoogleFont =
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com';
  const isImage =
    event.request.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp)$/i);
  const isFont =
    event.request.destination === 'font' ||
    url.pathname.match(/\.(woff|woff2|ttf|otf)$/i);
  const isStaticBundle = url.pathname.startsWith('/assets/') && url.pathname.match(/\.(js|css)$/i);

  if (isStaticBundle) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return;
  }

  if (isImage || isFont || isGoogleFont) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              (networkResponse.status === 200 || networkResponse.type === 'opaque')
            ) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => new Response('Offline', { status: 503, statusText: 'Service Unavailable' }));
      })
    );
    return;
  }

  // Navegación y otros GET: Network-first con fallback robusto a caché offline
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse =
          (await caches.match(event.request)) ||
          (await caches.match(url.pathname));
        if (cachedResponse) {
          return cachedResponse;
        }
        if (event.request.mode === 'navigate') {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(CASTING_URL)) ||
            (await cache.match(OFFLINE_URL)) ||
            new Response('Offline', { status: 503 })
          );
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});
