/* Eterno Pacto Kids · service worker: instalar la app, leer sin internet y recibir avisos */
const V = "epk-v8";
const BASE = ["/app", "/cuentas.js", "/comunidad.js", "/manifest.webmanifest", "/img/logo-kids.webp", "/img/grupo.webp", "/img/icono-192.png",
  "/img/santiago-full.webp", "/img/maria-full.webp", "/img/mateo-full.webp", "/img/sara-full.webp", "/img/simon-full.webp"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => Promise.all(BASE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("epk-") && k !== V && k !== "epk-archivos").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const guardar = (cache, req, res) => { if (res && (res.ok || res.type === "opaque")) caches.open(cache).then((c) => c.put(req, res.clone())); return res; };
const primeroRed = (req, cache) => fetch(req).then((r) => guardar(cache, req, r)).catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((r) => r || caches.match("/app")));
const primeroCache = (req, cache) => caches.match(req).then((r) => r || fetch(req).then((x) => guardar(cache, req, x)));
const cacheYActualiza = (req, cache) => caches.match(req).then((r) => { const red = fetch(req).then((x) => guardar(cache, req, x)).catch(() => r); return r || red; });

self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  // Archivos subidos (cuentos, materiales, fotos): una vez abiertos quedan para leer sin internet
  if (u.pathname.includes("/storage/v1/object/public/")) { e.respondWith(primeroCache(req, "epk-archivos")); return; }
  // Datos de la congregación: siempre de la red (la app guarda su propia copia)
  if (u.hostname.endsWith("supabase.co")) return;
  // Bibliotecas, fuentes y Biblias
  if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(u.hostname) || (u.origin === self.location.origin && /^\/(img|bib)\//.test(u.pathname))) {
    e.respondWith(cacheYActualiza(req, V)); return;
  }
  if (u.origin === self.location.origin) e.respondWith(primeroRed(req, V));
});

/* ---------- avisos en el celular ---------- */
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: "Eterno Pacto Kids", texto: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Eterno Pacto Kids", {
    body: d.texto || "", icon: "/img/icono-192.png", badge: "/img/icono-192.png", tag: d.tag || undefined, data: { url: d.url || "/" }
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ("focus" in c) { if ("navigate" in c) c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
