// Service Worker for Task Manager PWA
const CACHE_NAME = "task-manager-v4";
const RUNTIME_CACHE = "task-manager-runtime";
const API_CACHE = "task-manager-api";
const IMAGE_CACHE = "task-manager-images";

// Assets to cache on install
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/auth/login",
  "/offline.html",
];

// API routes to cache
const CACHEABLE_API_ROUTES = [
  "/api/projects",
  "/api/profiles",
  "/api/companies",
];

self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: Caching precache assets");
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.log("Some assets could not be cached:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== CACHE_NAME &&
            cacheName !== RUNTIME_CACHE &&
            cacheName !== API_CACHE &&
            cacheName !== IMAGE_CACHE
          ) {
            console.log("Service Worker: Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and external URLs
  if (request.method !== "GET" || !url.origin.includes(self.location.origin)) {
    return;
  }

  // API requests - Network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    // Skip binary downloads like /api/reports/
    if (url.pathname.startsWith("/api/reports")) {
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(API_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch((error) => {
          console.warn(`[SW] API fetch failed for ${url.pathname}:`, error);
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log(`[SW] Returning cached API response for ${url.pathname}`);
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({
                error: "Offline - data not available",
                details: error.message
              }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          });
        })
    );
    return;
  }

  // Image requests - Cache first
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          return fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch((error) => {
              console.error(`[SW] Image fetch failed for ${url.pathname}:`, error);
              return new Response(null, { status: 404 });
            });
        });
      })
    );
    return;
  }

  // HTML pages - Network first, fallback to cache
  if (request.headers.get("accept") && request.headers.get("accept").includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(RUNTIME_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch((error) => {
          console.warn(`[SW] HTML fetch failed for ${url.pathname}:`, error);
          return caches.match(request).then((cachedResponse) => {
            return (
              cachedResponse ||
              caches.match("/offline.html").then((offlinePage) => offlinePage)
            );
          });
        })
    );
    return;
  }

  // CSS/JS - Network first, fallback to cache
  // Changed from Cache First to Network First to prevent stale Next.js chunks
  // (old Turbopack bundles in SW cache cause "module factory not available" errors)
  if (
    /\.(css|js)$/i.test(url.pathname) ||
    (request.headers.get("accept") && request.headers.get("accept").includes("application/javascript"))
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch((error) => {
            console.warn(`[SW] JS/CSS fetch failed, trying cache for ${url.pathname}:`, error);
            return cache.match(request).then((cachedResponse) => {
              if (cachedResponse) return cachedResponse;
              return new Response(`/* Service Worker Error: ${error.message} */`, {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "application/javascript" }
              });
            });
          });
      })
    );
    return;
  }

  // Default - Network first
  event.respondWith(
    fetch(request)
      .catch((error) => {
        console.warn(`[SW] Default fetch failed for ${url.pathname}:`, error);
        return caches.match(request);
      })
  );
});
