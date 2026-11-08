const CACHE = 'gtav-riding-companion-v8';
const SHELL = ['/', '/index.html', '/companion.css', '/companion-app.js', '/companion-client.js', '/addons-logic.js', '/pairing-qr.js', '/qr-decoder.js', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', '/i18n/es.json', '/i18n/en.json', '/i18n/help-topics.json'];
self.addEventListener('install', event => {
  if (!SHELL.includes('/camera-logic.js')) SHELL.push('/camera-logic.js');
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request)));
});
