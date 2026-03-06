// ═══════════════════════════════════════════
// DCANT — Service Worker (minimal, online-only)
// Requis pour l'installabilité PWA
// ═══════════════════════════════════════════

const CACHE_NAME = 'dcant-shell-v2';

const SHELL_URLS = [
  '/',
  '/css/app.css',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne jamais cacher les appels API, Supabase, Anthropic, ni les fichiers JS
  if (url.pathname.startsWith('/api/') ||
      url.pathname.endsWith('.js') ||
      url.hostname.includes('supabase') ||
      url.hostname.includes('anthropic') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('google.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
