const CACHE_NAME = "wherehome-pwa-v2";
const APP_SHELL = [
  "./",
  "./wherehome.html",
  "./items.json",
  "./manifest.webmanifest",
  "./offline.html",
  "./apple-touch-icon.png",
  "./apple-touch-icon-precomposed.png",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 应用外壳和 items.json 走「网络优先」，保证改动能生效；
// 物品小图有 1000+ 张、内容永不变，走「缓存优先」，第一次看过就离线可用。
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isShell = sameOrigin && (
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/wherehome.html") ||
    url.pathname.endsWith("/items.json")
  );
  event.respondWith(
    isShell
      ? fetch(event.request)
          .then(res => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
            return res;
          })
          .catch(() => caches.match(event.request).then(c => c || caches.match("./offline.html")))
      : caches.match(event.request).then(cached => cached || fetch(event.request)
          .then(res => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
            return res;
          })
          .catch(() => caches.match("./offline.html")))
  );
});
