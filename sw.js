/* =========================================================
   GLIME SERVICE WORKER
   Receives web push messages and shows them as notifications
   on the visitor's device. Registered by cookie-consent.js
   only after the visitor accepts cookies and allows
   notifications.

   Expected push payload (JSON), all fields optional:
     { "title": "...", "body": "...", "url": "/page.html",
       "icon": "https://...png", "badge": "https://...png", "tag": "..." }
   ========================================================= */

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
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
