// Service worker: makes the app installable and lets saved trips open offline.
// - Pages: network first, falling back to the cached copy, then to /offline.
// - Next.js build assets (/_next/static, content-hashed): cache first.
// - Other same-origin files (icons, photos in /images): stale-while-revalidate.
// Nothing cross-origin is cached (the API, Google sign-in, map tiles), so
// plan data only ever comes from the API or the copy saved in localStorage.

const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ["/", "/offline", "/trips", "/results", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      // One missing page mustn't stop installation.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![PAGES, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The app asks for pages to be cached when a trip is saved for offline use.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-urls" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((u) => typeof u === "string" && u.startsWith("/"));
  event.waitUntil(caches.open(PAGES).then((cache) => Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)))));
});

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(stripQuery(request), response.clone());
    return response;
  } catch {
    // /results?id=… is one client-rendered page: any cached copy of it works.
    return (await cache.match(stripQuery(request))) || (await cache.match("/offline")) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return hit || (await refresh) || Response.error();
}

function stripQuery(request) {
  const url = new URL(request.url);
  return `${url.origin}${url.pathname}`;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith("/_next/")) {
    // Dev-server and data requests: always live.
    return;
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
