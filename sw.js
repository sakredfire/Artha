// SideStack Service Worker v5.0 — India Launch
const CACHE_NAME = 'sidestack-v5';
const OFFLINE_URL = '/Sidestack/';

const PRECACHE_URLS = [
  '/Sidestack/',
  '/Sidestack/index.html',
  '/Sidestack/manifest.json',
  '/Sidestack/icon-192.png',
  '/Sidestack/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE_URLS).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Network-first: fonts, CDN scripts (Tesseract, jsPDF need fresh)
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'cdnjs.cloudflare.com'
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() =>
        caches.match(OFFLINE_URL) || new Response(
          `<html><body style="background:#080810;color:#CBFF47;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
            <div><div style="font-size:56px">S₹</div><h2 style="margin:12px 0">You're offline</h2>
            <p style="color:#5A5A70;font-size:13px">Open SideStack when connected.</p></div>
          </body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        )
      );
    })
  );
});

// Background sync placeholder
self.addEventListener('sync', event => {
  if (event.tag === 'sync-income') {
    console.log('[SideStack SW] Background sync triggered');
  }
});
