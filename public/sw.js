/* FIFA World Cup 2026 — Service Worker
   Strategy: cache-first for static assets; network-first for the page itself.
   This lets the app load offline and install to the home screen (PWA). */

const CACHE = "wc2026-v1";

// Assets to pre-cache on install (relative to sw.js location = site root).
const PRECACHE = ["/", "/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Only handle same-origin GET requests.
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;

  const url = new URL(e.request.url);

  // Network-first for the HTML shell so updates propagate immediately.
  if (url.pathname === "/" || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (JS/CSS/assets).
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        })
    )
  );
});
