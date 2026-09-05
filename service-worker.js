const CACHE = "benedict-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./ics-parser.js",
  "./manifest.json",
  "./icon192.png",
  "./icon512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for API calls (weather/calendar), cache-first for the app shell.
self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  const isApiCall = url.includes("openweathermap.org") || url.includes("calendar.google.com") || url.includes("corsproxy.io");
  if (isApiCall) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
