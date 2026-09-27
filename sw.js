/* إدارة المستودع — Service Worker
   يجعل التطبيق يعمل بدون إنترنت بالكامل بعد أول تحميل.
   عند تحديث أي ملف، غيّر رقم CACHE أدناه ليصل التحديث للجهاز. */

const CACHE = 'tios-warehouse-v2.3.3';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[SW] failed to precache', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  // Only handle our own origin. Anything else goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Page loads: serve the cached shell instantly, refresh it in the background.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = (await cache.match('./index.html')) || (await cache.match('./'));

      const network = fetch(request).then(async (response) => {
        if (response && response.ok) await cache.put('./index.html', response.clone());
        return response;
      }).catch(() => null);

      return cached || (await network) || new Response(
        '<h1>غير متاح بدون إنترنت</h1><p>افتح التطبيق مرة واحدة مع اتصال بالإنترنت أولاً.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  // Everything else: cache-first, then network, and cache what we fetch.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      const fallback = await cache.match('./index.html');
      if (fallback && request.destination === 'document') return fallback;
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
