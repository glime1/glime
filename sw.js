/* =========================================================
   GLIME SERVICE WORKER
   1) Push: receives web push messages and shows them as
      notifications on the visitor's device.
   2) App: when a page cannot be loaded because the device is
      offline, shows offline.html instead of the browser error.

   Registered by glime-pwa.js on every page that loads it, and by
   cookie-consent.js after the visitor accepts cookies and allows
   notifications (both register the same file).

   Only page navigations are handled. Images, scripts, Supabase and
   payment requests are never touched.

   Expected push payload (JSON), all fields optional:
     { "title": "...", "body": "...", "url": "/page.html",
       "icon": "https://...png", "badge": "https://...png", "tag": "..." }
   ========================================================= */

var CACHE = 'glime-shell-v1';
var PRECACHE = ['/offline.html', '/icons/icon.svg'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) {
          return k.indexOf('glime-shell-') === 0 && k !== CACHE;
        }).map(function (k) { return caches.delete(k); }));
      })
      .catch(function () {})
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith(
    fetch(req).catch(function () {
      return caches.match('/offline.html').then(function (res) {
        return res || new Response('You are offline.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }

  var options = {
    body: data.body || '',
    data: { url: data.url || '/' }
  };
  if (data.icon) options.icon = data.icon;
  if (data.badge) options.badge = data.badge;
  if (data.tag) options.tag = data.tag;

  event.waitUntil(self.registration.showNotification(data.title || 'GLIME', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var target = self.location.origin + '/';
  try {
    var u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
    /* Only open pages of this website. */
    if (u.origin === self.location.origin) target = u.href;
  } catch (e) {}

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url === target && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
