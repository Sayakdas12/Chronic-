const CACHE_NAME = "chronicai-offline-v7";
const OFFLINE_URLS = [
  "/",
  "/html/index.html",
  "/html/citizen.html",
  "/html/citizen-dashboard.html",
  "/html/responder-dashboard.html",
  "/html/risk-dashboard.html",
  "/html/journey.html",
  "/html/life-helper.html",
  "/html/login.html",
  "/html/register.html",
  "/html/request.html",
  "/html/missing-persons.html",
  "/html/report-problem.html",
  "/html/resource-center.html",
  "/html/scan-product.html",
  "/html/track.html",
  "/html/admin-dashboard.html",
  "/html/admin-login.html",
  "/html/complaint.html",
  "/html/support.html",
  "/html/report-problem.html",
  "/js/citizen.js",
  "/js/complaint.js",
  "/js/firebase-client.js",
  "/js/auth-guard.js",
  "/js/journey.js",
  "/js/login.js",
  "/js/register.js",
  "/js/request.js",
  "/js/missing-persons.js",
  "/js/report-problem.js",
  "/js/resource-center.js",
  "/js/risk-dashboard.js",
  "/js/offline-app.js",
  "/js/sos.js",
  "/js/citizen-dashboard.js",
  "/js/responder-dashboard.js",
  "/css/design-tokens.css",
  "/css/global.css",
  "/css/admin-dashboard.css",
  "/css/theme-sync.css",
  "/css/prisma-hero.css",
  "/css/rescue-tracking.css",
  "/images/goverment%20logo.png",
  "/images/hero-command-center.jpg",
  "/images/tactical-responder-bg.jpg",
  "/images/citizen-operations-bg.jpg",
  "/css/risk-dashboard.css",
  "/css/request.css",
  "/css/missing-persons.css",
  "/css/citizen.css",
  "/css/journey.css",
  "/css/report.css",
  "/css/resource-center.css",
  "/assets/manifest.json",
  "/icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        OFFLINE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn(`Offline cache skipped ${url}:`, error);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  if (isSameOrigin && event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match("/html/index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            isSameOrigin &&
            networkResponse && networkResponse.status === 200
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }

          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }

          return new Response("Offline", {
            status: 503,
            headers: {
              "Content-Type": "text/plain"
            }
          });
        });
    })
  );
});
