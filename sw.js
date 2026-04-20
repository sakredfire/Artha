// SideStack Service Worker v4.0
const CACHE_NAME = 'sidestack-v4';
const OFFLINE_URL = '/Sidestack/';

// Files to cache immediately on install
const PRECACHE_URLS = [
  '/Sidestack/',
  '/Sidestack/index.html',
  '/Sidestack/manifest.json',
  '/Sidestack/icon-192.png',
  '/Sidestack/icon-512.png',
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

// ── FETCH: cache-first for app shell, network-first for fonts ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http requests
  if (!event.request.url.startsWith('http')) return;

  // Network-first for Google Fonts (always fresh)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (app shell, assets)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }

        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, toCache);
        });

        return response;
      }).catch(() => {
        // Offline fallback: return cached index.html
        return caches.match(OFFLINE_URL) || new Response(
          '<html><body style="background:#080810;color:#C9FF47;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;"><div><div style="font-size:48px">📵</div><h2>You\'re offline</h2><p style="color:#9494B0;margin-top:8px">Open SideStack when connected to sync your data.</p></div></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      });
    })
  );
});

// ── BACKGROUND SYNC (future: sync income logs when back online) ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-income') {
    // Placeholder for future background sync
    console.log('SideStack: Background sync triggered');
  }
});
