// ══════════════════════════════════════════════════════════════
// AL-NUKHBA EXPRESS — Service Worker
// Provides: offline support, asset caching, background sync
// Strategy: Cache-first for assets, Network-first for API calls
// ══════════════════════════════════════════════════════════════

const CACHE_NAME    = "nukhba-v1";
const ASSETS_CACHE  = "nukhba-assets-v1";
const API_CACHE     = "nukhba-api-v1";

// Static assets to cache on install
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(ASSETS_CACHE).then(cache => {
      console.log("[SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn("[SW] Some assets failed to cache:", err.message);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== ASSETS_CACHE && k !== API_CACHE)
          .map(k => {
            console.log("[SW] Deleting old cache:", k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Never intercept Supabase API calls — always go network
  if (url.hostname.includes("supabase")) {
    return event.respondWith(fetch(event.request));
  }

  // For navigation requests — return cached index.html (SPA)
  if (event.request.mode === "navigate") {
    return event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("./index.html")
      )
    );
  }

  // For static assets — cache first, then network
  if (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".ico")
  ) {
    return event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(ASSETS_CACHE).then(cache =>
            cache.put(event.request, clone)
          );
          return response;
        });
      })
    );
  }

  // Default: network first
  return event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
