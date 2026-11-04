/* Karteikasten – Service Worker
   App-Dateien: Network-first (online immer der neueste Stand), offline aus dem Cache.
   vendor/ (versionierte Bibliotheken wie SQLite-WASM): Cache-first. */

const CACHE = "karteikasten-v2";
const LIBS = [
  "./vendor/fflate.mjs", "./vendor/fzstd.mjs",
  "./vendor/sqlite-wasm/index.mjs", "./vendor/sqlite-wasm/sqlite3.wasm",
];
const SHELL = [
  "./", "./index.html", "./style.css", "./app.js", "./store.js", "./manifest.webmanifest",
  "./anki/collection.js", "./anki/package.js", "./anki/proto.js", "./anki/render.js",
  "./anki/scheduler.js", "./anki/zstd.js",
  "./icons/icon-192.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all([c.addAll(SHELL), c.addAll(LIBS)]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname.includes("/vendor/")) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit => {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        })
      )
  );
});
