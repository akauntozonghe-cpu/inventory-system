const CACHE_NAME = "inventory-os-shell-v6";
const SHELL = ["/offline", "/pwa/icon-192?v=4", "/pwa/icon-512?v=4"];

self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("inventory-os-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname + url.search)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) { const copy = response.clone(); void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); } return response; })));
  }
});

self.addEventListener("push", event => {
  let payload = {}; try { payload = event.data?.json() ?? {}; } catch {}
  event.waitUntil(self.registration.showNotification("Inventory OS", { body: payload.body === "端末通知のテストです。" ? payload.body : "新しい通知があります。アプリで内容を確認してください。", icon: "/pwa/icon-192?v=4", badge: "/pwa/icon-192?v=4", tag: typeof payload.tag === "string" ? payload.tag.slice(0,120) : "inventory-notification", data: { url: "/notifications" } }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async clients => {
    const url = new URL("/notifications",self.location.origin).href;
    // Never navigate a working stocktake tab away from unsaved input.
    const existing = clients.find(client => client.url === url);
    if(existing) return existing.focus();
    return self.clients.openWindow(url);
  }));
});
