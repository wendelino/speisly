/**
 * Speisly Service Worker (ausgeliefert als /sw.js, src/pages/sw.js.ts setzt
 * die Version ein). Plain JS ohne Imports, läuft so wie er ist im Browser.
 *
 * Offline-Modus:
 *  - Seiten (Speisepläne, Gerichte): Network-first mit Timeout, bei
 *    fehlendem Netz die zuletzt geladene Fassung, sonst /offline
 *  - /_astro/* (Dateinamen mit Hash): Cache-first
 *  - /img/* (Gerichtsbilder): Cache-first, begrenzt
 *  - „warm“ (Nachricht der Seite, lib/service-worker.ts): heute und die
 *    nächsten Tage samt CSS/JS vorhalten, höchstens stündlich
 *
 * Push: zeigt Benachrichtigungen zu Favoriten (src/server/push.ts) und
 * öffnet beim Antippen den Speiseplan des Tages.
 *
 * Nie gecacht: Actions, API, Admin, Server Islands, OG-Bilder.
 */
const VERSION = "__SW_VERSION__";
const PAGES = `speisly-pages-${VERSION}`;
const ASSETS = `speisly-assets-${VERSION}`;
const IMAGES = "speisly-images-v1";
// eigener Cache, damit `trim` der Seiten die Offline-Seite nie verdrängt
const OFFLINE = `speisly-offline-${VERSION}`;
const KEEP = [PAGES, ASSETS, IMAGES, OFFLINE];

const OFFLINE_URL = "/offline";
const MAX_PAGES = 40;
const MAX_IMAGES = 250;
const NETWORK_TIMEOUT_MS = 4000;
/** so viele Werktage nach heute vorhalten (am Wochenende hat keine Mensa auf) */
const WARM_DAYS = 3;
const WARM_INTERVAL_MS = 60 * 60 * 1000;
const CACHED_AT = "x-speisly-cached-at";

const SKIP = /^\/(?:_actions|api|admin|_server-islands|og|sw\.js)(?:\/|$|\.)/;
const PAGE = /^\/(?:$|day\/|meal\/|offline$|favoriten$|meine-daten$)/;
const STATIC =
  /^\/(?:favicon\.ico|apple-touch-icon\.png|manifest\.webmanifest|icons\/)/;
const ASSET_IN_HTML = /(?:href|src)="(\/_astro\/[^"]+)"/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await cachePage(new Request(OFFLINE_URL), OFFLINE);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("speisly-") && !KEEP.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "warm") {
    event.waitUntil(warm());
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(page(event));
  } else if (url.pathname.startsWith("/_astro/")) {
    event.respondWith(cacheFirst(request, ASSETS));
  } else if (url.pathname.startsWith("/img/")) {
    event.respondWith(cacheFirst(request, IMAGES, MAX_IMAGES));
  } else if (STATIC.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});

/** Navigation: Netz zuerst, nach Timeout oder ohne Netz aus dem Cache */
async function page(event) {
  const { request } = event;
  const cacheable = PAGE.test(new URL(request.url).pathname);
  const network = fetch(request).then(async (response) => {
    if (cacheable && isCacheable(response)) {
      await putPage(request, response.clone());
    }
    return response;
  });
  // läuft weiter, auch wenn der Cache schneller antwortet
  event.waitUntil(network.catch(() => null));

  try {
    return await withTimeout(network, cacheable ? NETWORK_TIMEOUT_MS : 0);
  } catch (error) {
    const cached = await caches.match(request, { cacheName: PAGES });
    // Bei langsamem Netz nur eine Fassung von heute zeigen (sonst wäre „/“
    // der Plan von gestern), ganz ohne Netz jede
    const timedOut = error instanceof Error && error.message === "timeout";
    if (cached && !(timedOut && !cachedToday(cached))) {
      return cached;
    }
    try {
      return await network;
    } catch {
      return (
        cached ??
        (await caches.match(OFFLINE_URL, { cacheName: OFFLINE })) ??
        Response.error()
      );
    }
  }
}

function cachedToday(response) {
  const at = Number(response.headers.get(CACHED_AT) ?? 0);
  return at > 0 && berlinDay(0, new Date(at)) === berlinDay(0);
}

function withTimeout(promise, ms) {
  if (!ms) {
    return promise;
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function isCacheable(response) {
  return response.ok && response.type === "basic" && !response.redirected;
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (isCacheable(response)) {
    await cache.put(request, response.clone());
    if (limit) {
      trim(cache, limit);
    }
  }
  return response;
}

/** Seite mit Zeitstempel ablegen (für „warm“ und die Offline-Übersicht) */
async function putPage(request, response, cacheName = PAGES) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT, String(Date.now()));
  const body = await response.blob();
  const cache = await caches.open(cacheName);
  await cache.put(
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  );
  if (cacheName === PAGES) {
    await trim(cache, MAX_PAGES);
  }
  return body;
}

/** Seite laden, ablegen und ihr CSS/JS mitnehmen */
async function cachePage(request, cacheName = PAGES) {
  const response = await fetch(request, { cache: "no-cache" });
  if (!isCacheable(response)) {
    return;
  }
  const body = await putPage(request, response, cacheName);
  const html = await body.text();
  const assets = [...html.matchAll(ASSET_IN_HTML)].map((match) => match[1]);
  const cache = await caches.open(ASSETS);
  await Promise.all(
    [...new Set(assets)].map(async (asset) => {
      if (!(await cache.match(asset))) {
        await cache.add(asset).catch(() => null);
      }
    })
  );
}

/** Älteste Einträge entfernen (Cache-Reihenfolge = Einfügereihenfolge) */
async function trim(cache, limit) {
  const keys = await cache.keys();
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - limit))
      .map((key) => cache.delete(key))
  );
}

/** `YYYY-MM-DD` in Berlin, `offset` Tage nach `from` (Default: jetzt) */
function berlinDay(offset, from = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
  const date = new Date(`${parts}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Die nächsten `count` Werktage nach heute (Berlin), ohne Sa/So */
function nextWeekdays(count) {
  const days = [];
  for (let offset = 1; days.length < count && offset < 14; offset++) {
    const day = berlinDay(offset);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      days.push(day);
    }
  }
  return days;
}

let warming = null;

/** Speisepläne von heute und den nächsten Tagen vorhalten */
function warm() {
  warming ??= (async () => {
    try {
      if (self.navigator.connection?.saveData) {
        return;
      }
      const cache = await caches.open(PAGES);
      const urls = ["/", ...nextWeekdays(WARM_DAYS).map((d) => `/day/${d}`)];
      for (const url of urls) {
        const cached = await cache.match(url);
        const at = Number(cached?.headers.get(CACHED_AT) ?? 0);
        if (Date.now() - at > WARM_INTERVAL_MS) {
          await cachePage(new Request(url)).catch(() => null);
        }
      }
    } finally {
      warming = null;
    }
  })();
  return warming;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Speisly", {
      body: data.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin)
    .href;
  event.waitUntil(
    (async () => {
      // nur eigene Fenster umleiten: `navigate` geht nur bei kontrollierten
      // Clients, sonst ein neues Fenster öffnen
      const windows = await self.clients.matchAll({ type: "window" });
      for (const client of windows) {
        try {
          // erst fokussieren (nur direkt nach dem Antippen erlaubt)
          await client.focus();
          await client.navigate(url);
          return;
        } catch {
          // nächstes Fenster versuchen
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
