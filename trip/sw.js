// Keeps the trip app's own files on the phone, so it opens in Budapest even with no signal.
// The data itself is cached by Firestore (enablePersistence in index.html); this only covers the page,
// the logo, the Firebase scripts and the fonts. The app's own files go to the network first, so a new version arrives
// as soon as there's signal; the versioned CDN files come straight from the phone once stored.
const CACHE = 'trip-v1';
// './' itself isn't stored: opening the folder falls back to index.html
const SHELL = ['index.html', 'logo.webp', 'icon.png', 'manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const mine = url => url.origin === location.origin && !url.pathname.endsWith('.enc');
const cdn = url => /^https:\/\/(www\.gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx)\//.test(url.href);

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || !(mine(url) || cdn(url))) return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    // the CDN files carry their version in the address, so a stored copy never goes stale
    if (hit && cdn(url)) return hit;
    const net = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    });
    const cached = hit || (req.mode === 'navigate' ? await caches.match('index.html') : undefined);
    if (!cached) return net;
    // a weak signal can hang for a long time: after 5 seconds use the copy on the phone (the download still finishes and refreshes it)
    return Promise.race([net, new Promise(ok => setTimeout(() => ok(cached), 5000))]).catch(() => cached);
  })());
});
