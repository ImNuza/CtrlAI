/* ============================================================
   GARDEN OF LIFE — Service Worker
   Offline-first shell. Bump CACHE_VERSION on every deploy.
   ============================================================ */

const CACHE_VERSION = 'gol-v11';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const FONT_CACHE  = `${CACHE_VERSION}-fonts`;

/* Relative paths so this works whether app/ is the site root or a subfolder. */
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './game.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  /* The land plates are referenced from CSS, so they are wanted on first
     paint. The plant plates are deliberately left out: thirty of them is
     about 400KB, they are only needed once something is actually growing,
     and the stale-while-revalidate branch below caches each one the first
     time it is drawn. */
  './art/land/grass.png',
  './art/land/patch-bare.png',
  './art/land/patch-planted.png',
  // The gardener is on screen the moment the garden is, and it is 12KB.
  './art/characters/gardener-walk.png',
];

/* ── Install: precache the shell ───────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is atomic: one 404 fails the whole install, so add individually
      // and tolerate misses rather than shipping a broken worker.
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: drop caches from previous versions ──────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch ─────────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Google Fonts — immutable once fetched, so cache-first.
     This is what makes the app render correctly offline. */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
          return res;
        } catch (e) {
          // No network and nothing cached: the CSS font stack falls back to
          // Georgia / system-ui, so the app stays fully usable.
          return new Response('', { status: 504, statusText: 'offline' });
        }
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* Navigations — network-first so a redeploy is picked up immediately,
     falling back to the cached shell when offline. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true })
          .then((hit) => hit || caches.match('./')))
    );
    return;
  }

  /* Static same-origin assets — stale-while-revalidate: instant from cache,
     refreshed in the background for the next load. */
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => null);
      return hit || network.then((r) => r || new Response('', { status: 504 }));
    })
  );
});

/* Allow the page to force an update without a manual reload cycle. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
