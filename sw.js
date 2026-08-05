// ---------------------------------------------------------------------------
// MMRY service worker
//
// Two jobs:
//
//   1. Never serve a stale app. The code is fetched network-first, so a fresh
//      deploy is live on the next load — no private tabs, no cache clearing.
//   2. Survive bad signal. Audio and map tiles are cache-first, so a walk that
//      loses reception keeps playing instead of falling silent.
//
// Bump VERSION to retire old caches.
// ---------------------------------------------------------------------------

const VERSION = "v12";
const SHELL_CACHE = `mmry-shell-${VERSION}`;
const MEDIA_CACHE = `mmry-media-${VERSION}`;
const TILE_CACHE = "mmry-tiles";
const TILE_LIMIT = 400;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./builder.html",
  "./walk.html",
  "./style.css",
  "./engine.js",
  "./zones.js",
  "./app.js",
  "./storage.js",
  "./builder.js",
  "./walk.js",
  "./share.js",
  "./recorder.js",
  "./supabase-config.js",
  "./manifest.json",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./vendor/qrcode/qrcode.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) =>
        Promise.all(
          SHELL_ASSETS.map((url) =>
            cache.add(url).catch((err) => console.warn("Precache skipped", url, err))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (n) =>
                n.startsWith("mmry-") &&
                n !== SHELL_CACHE &&
                n !== MEDIA_CACHE &&
                n !== TILE_CACHE
            )
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

// Cache-first: for things that never change once fetched.
async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  // Opaque responses (cross-origin tiles) have status 0 but are still usable.
  if (response && (response.ok || response.type === "opaque")) {
    cache.put(request, response.clone());
    if (limit) trimCache(cacheName, limit);
  }
  return response;
}

// Network-first: for code, so a deploy is never more than one load away.
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    // Any navigation should land somewhere rather than showing a browser error.
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // --- Cross-origin, cache-first ------------------------------------------

  if (
    url.hostname.endsWith("basemaps.cartocdn.com") ||
    url.hostname.endsWith("tile.openstreetmap.org")
  ) {
    event.respondWith(cacheFirst(request, TILE_CACHE, TILE_LIMIT));
    return;
  }

  // Published journey audio lives on Supabase and never changes at a given
  // URL, so it caches like local audio — a shared walk survives losing signal.
  if (url.pathname.includes("/storage/v1/object/public/audio/")) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  // Anything else cross-origin — API calls included — goes straight to network.
  if (url.origin !== self.location.origin) return;

  // --- Same origin ---------------------------------------------------------

  if (url.pathname.includes("/audio/") || url.pathname.includes("/icons/")) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  event.respondWith(networkFirst(request));
});
