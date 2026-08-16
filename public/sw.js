const CACHE_NAME = "wherehome-pwa-v4";
const APP_SHELL = [
  "./",
  "./wherehome.html",
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

// 外壳走「网络优先」，保证改动能生效。
// data.enc（6.5MB，每次发布才变）和物品小图走「缓存优先」，看过一次就离线可用。
// 注意：APP_SHELL 里只能放生产环境一定存在的文件——cache.addAll 只要有一个 404
// 就整体 reject，Service Worker 会直接装不上。items.json 只在本地开发时存在，
// 绝不能放进来。
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
