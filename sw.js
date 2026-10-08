const CACHE = 'niva-v5';
const BASE = '/Niva-Smart-App';
const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
];

// Precaching is best-effort. If install could fail, this worker could never
// replace an older one — that is how phones got stuck on the June niva-v2
// cache-first worker: every later version precached root paths that 404 on
// GitHub Pages, so addAll rejected and install never completed.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Same-origin GETs only. Firebase, Firestore and Gemini go straight to the network.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Network-first for page navigations / HTML so app updates show up immediately.
  // Cache is only the offline fallback.
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() =>
        caches.match(req).then(c => c || caches.match(BASE + '/index.html'))
      )
    );
    return;
  }

  // Cache-first for other static assets (icons, manifest, etc.)
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (!res || res.status !== 200 || res.type !== 'basic') return res;
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
      return res;
    }))
  );
});
