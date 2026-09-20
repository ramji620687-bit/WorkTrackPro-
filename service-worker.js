// WorkTrack Pro - Service Worker
// Caches the app shell so it works fully offline after first visit,
// AND handles the local attendance-reminder notification's quick-action
// buttons (Mark All Present / Mark All Absent) — no server required.

const CACHE_NAME = 'worktrack-pro-v11';
const FILES_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: pre-cache the app files
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - The main page (navigation requests) uses NETWORK-FIRST, so any time
//   you're online you always get the latest version instantly — no more
//   "old cached version" confusion after an update. Falls back to the
//   cached copy only if there's no internet.
// - Other files (icons, manifest) stay CACHE-FIRST for fast offline use.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => cached);
    })
  );
});

/* ======================================================
   NOTIFICATION ACTION HANDLING (free, no server/push needed)
   The main app calls registration.showNotification(...) itself whenever
   it's opened and today's attendance looks incomplete. This listener
   just handles what happens when the person taps the notification or
   one of its two quick-action buttons.
   ====================================================== */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action; // 'present', 'absent', or '' (body tap)
  const scopeUrl = self.registration.scope;
  const targetUrl = action ? (scopeUrl + '?quickmark=' + action) : scopeUrl;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open in a tab, just message it directly —
      // no need to navigate or open a new window.
      for (const client of clientList) {
        if ('focus' in client) {
          if (action) client.postMessage({ type: 'quickmark', action: action });
          return client.focus();
        }
      }
      // Otherwise open the app so it can read the ?quickmark= param.
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
