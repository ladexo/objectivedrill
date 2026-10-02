// Network-first service worker: always tries fresh files, falls back to cache offline.
const CACHE = 'objectivedrill-v3';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './favicon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never touch Supabase (*.supabase.co / *.supabase.in) or any cross-origin request: no caching, no interception.
  if (/(^|\.)supabase\.(co|in|net)$/i.test(url.hostname) || url.pathname.includes('/auth/v1/') || url.pathname.includes('/rest/v1/')) return;
  if (url.origin !== self.location.origin) return;
  // Never cache auth callbacks (OAuth / email-confirm / recovery redirects carry ?code= or error params). Let the network handle them.
  if (url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('error_description') || url.searchParams.has('access_token') || /[#&](access_token|refresh_token|error_description)=/.test(url.hash)) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
