// Network-first service worker: always tries fresh files, falls back to cache offline.
// GitHub Pages sends `Cache-Control: max-age=600`, so a plain fetch() of index.html can be answered by the browser's HTTP cache with a STALE shell that
// points at deleted hashed chunks (404 on the lazy sign-in chunk -> blank app). The shell (navigations, index.html, manifest, sw.js) therefore always
// revalidates with the server (`cache: 'no-cache'`: conditional request, cheap 304). Hashed /assets/* are immutable, so the HTTP cache is fine for them.
const CACHE = 'objectivedrill-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const upgrading = keys.some((k) => k !== CACHE);
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Upgrade from an older worker: open tabs may hold a stale shell (and older pages have no controllerchange listener), so reload them once.
    // Never yank a tab that is mid-exam; it picks the new version up on its next navigation.
    if (upgrading) {
      const wins = await self.clients.matchAll({ type: 'window' })
      // Deliberately NOT awaited: navigate() resolves only after the page loads, and loading needs this worker's fetch handler, which does not run until
      // activation (this waitUntil) finishes. Awaiting it would deadlock the navigation.
      wins.filter((w) => !/#\/exam/.test(w.url)).forEach((w) => { w.navigate(w.url).catch(() => undefined) })
    }
  })());
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
  const shell = req.mode === 'navigate' || req.destination === 'document' || url.pathname.endsWith('/') || /\/(index\.html|sw\.js|manifest\.webmanifest)$/.test(url.pathname);
  e.respondWith(
    (shell ? fetch(req, { cache: 'no-cache' }) : fetch(req)).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
