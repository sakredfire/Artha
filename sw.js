// Sakred Artha Service Worker v4.1
const CACHE_NAME = 'artha-v9';
const OFFLINE_URL = '/';

// Files to cache immediately on install (root paths — served from app.sakredfire.ca)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon192.png',
  '/icon512.png',
  '/icon-maskable-512.png',
];

// ── INSTALL: cache core assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Silently fail on individual files - app still works
      });
    })
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ── FETCH ──
// Network-first for navigations / HTML / root, so a fresh build is always served
// (and a returning user or the TWA never gets stuck on a stale cached shell).
// Cache-first for static assets (icons, manifest, scripts) and fonts.
self.addEventListener('fetch', event => {
  const req = event.request;

  // Skip non-GET and non-http(s) requests
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isNavigation = req.mode === 'navigate';
  const isHTML = sameOrigin && (url.pathname === '/' || url.pathname.endsWith('.html'));

  // Network-first for the app shell
  if (isNavigation || isHTML) {
    event.respondWith(
      fetch(req).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, toCache));
        }
        return response;
      }).catch(() =>
        caches.match(req)
          .then(cached => cached || caches.match(OFFLINE_URL))
          .then(cached => cached || new Response(
            '<html><body style="background:#080810;color:#C9FF47;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;"><div><div style="font-size:48px">📵</div><h2>You\'re offline</h2><p style="color:#9494B0;margin-top:8px">Open Sakred Artha when connected to sync your data.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          ))
      )
    );
    return;
  }

  // Cache-first for static assets and fonts
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, toCache));
        return response;
      });
    })
  );
});

// ── BACKGROUND SYNC (future: sync income logs when back online) ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-income') {
    // Placeholder for future background sync
    console.log('Artha: Background sync triggered');
  }
});
