// Network-first for app files, so updates arrive by themselves (no more clearing cache).
const CACHE = "benedict-v3";
const SHELL = ["./", "./index.html", "./app.css", "./app.js", "./ics-parser.js", "./olven.js", "./manifest.json", "./icon180.png", "./icon192.png", "./icon512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // APIs go straight to the network
  if (/\.(png|ico|svg)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
