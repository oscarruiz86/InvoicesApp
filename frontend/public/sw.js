const VERSION = 'v3';
const CACHE = `invoices-shell-${VERSION}`;
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.svg', '/icons/icon-512.svg'];
const SYNC_TAG = 'invoice-app-sync';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('invoices-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
 self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('sync', event => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(Promise.resolve());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok) { const copy = response.clone(); await caches.open(CACHE).then(cache => cache.put('/', copy)); }
      return response;
    }).catch(async () => (await caches.match(request)) ?? (await caches.match('/')) ?? Response.error()));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/')) event.respondWith(caches.match(request).then(cached => cached ?? fetch(request).then(async response => {
    if (response.ok) { const copy = response.clone(); await caches.open(CACHE).then(cache => cache.put(request, copy)); }
    return response;
  })));
});
