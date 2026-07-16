const CACHE = 'kph-wc26-v48';
const SHELL = [
  '/kph-wc26/',
  '/kph-wc26/index.html',
  '/kph-wc26/app.js',
  '/kph-wc26/style.css',
  '/kph-wc26/matches.js',
  '/kph-wc26/firebase-config.js',
  '/kph-wc26/manifest.json',
  '/kph-wc26/icon-192.png',
  '/kph-wc26/icon-512.png',
  '/kph-wc26/wc.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for Firebase, cache-first for shell
  if (e.request.url.includes('firestore') || e.request.url.includes('firebase')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
