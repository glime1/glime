/* =========================================================
   GLIME SERVICE WORKER
   1) Push: receives web push messages and shows them as
      notifications on the visitor's device.
   2) App: when a page cannot be loaded, shows a GLIME page
      instead of the browser error:
        - device offline            -> offline.html ("You're offline")
        - server down (HTTP 5xx)    -> "GLIME is temporarily unavailable"

   Registered by glime-pwa.js on every page that loads it, and by
   cookie-consent.js after the visitor accepts cookies and allows
   notifications (both register the same file).

   Only page navigations are handled. Images, scripts, Supabase and
   payment requests are never touched.

   Expected push payload (JSON), all fields optional:
     { "title": "...", "body": "...", "url": "/page.html",
       "icon": "https://...png", "badge": "https://...png", "tag": "..." }
   ========================================================= */

var CACHE = 'glime-shell-v2';
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

/* Page shown when the device is online but the server answers with an error. */
function unavailablePage() {
  return caches.match('/icons/icon.svg')
    .then(function (res) { return res ? res.text() : ''; })
    .catch(function () { return ''; })
    .then(function (svg) {
      var logo = svg
        ? '<img class="logo" alt="GLIME" width="88" height="88" src="data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(svg) + '">'
        : '';
      var html =
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<meta name="theme-color" content="#071016"><title>Unavailable | GLIME</title>' +
        '<style>' +
        ':root{--bg:#071016;--surf:#101b29;--bd:rgba(184,222,234,.13);--tx:#f4fbfd;--mu:#9cabb9;--cy:#52e8ff;--gr:#50f5a8}' +
        '*{box-sizing:border-box;margin:0;padding:0}' +
        'body{min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--tx);font-family:Manrope,Arial,sans-serif;line-height:1.6}' +
        '.box{width:min(420px,100%);text-align:center;padding:32px 22px;background:var(--surf);border:1px solid var(--bd);border-radius:20px}' +
        '.logo{display:block;margin:0 auto 18px;border-radius:20px}' +
        'h1{font-size:1.4rem;letter-spacing:-.02em;margin-bottom:8px}' +
        'p{color:var(--mu);font-size:.88rem;margin-bottom:22px}' +
        'button{min-height:46px;padding:10px 26px;border:0;border-radius:12px;background:linear-gradient(105deg,var(--gr),var(--cy));color:#031014;font:inherit;font-weight:800;font-size:.9rem;cursor:pointer}' +
        'button:focus-visible{outline:2px solid var(--cy);outline-offset:3px}' +
        '</style></head><body><main class="box">' + logo +
        '<h1>GLIME is temporarily unavailable</h1>' +
        '<p>We are having a technical problem on our side. Your data is safe. Please try again in a few minutes.</p>' +
        '<button id="retry" type="button">Try again</button></main>' +
        '<script>document.getElementById("retry").addEventListener("click",function(){location.reload();});</script>' +
        '</body></html>';
      return new Response(html, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    });
}

function offlinePage() {
  return caches.match('/offline.html').then(function (res) {
    return res || new Response('You are offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith(
    fetch(req).then(function (res) {
      /* Server reachable but failing (for example hosting outage). */
      if (res && res.status >= 500 && res.status <= 599) return unavailablePage();
      return res;
    }).catch(function () {
      return offlinePage();
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
