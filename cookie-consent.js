/* =========================================================
   GLIME COOKIE CONSENT
   ---------------------------------------------------------
   Cookie banner for the public website.

   - Accept          -> consent saved (cookie + localStorage) and the
                        browser is asked to allow GLIME notifications.
                        Once allowed, the service worker (sw.js) is
                        registered so notifications reach the device.
   - Essential only  -> consent saved, no notification prompt.

   Loaded automatically by glime-global-nav.js.

   Public API:
     GLIME_COOKIE_CONSENT.get()   -> { status: 'accepted' | 'essential' } | null
     GLIME_COOKIE_CONSENT.open()  -> show the banner again
   Any element with the attribute  data-glime-cookie-settings
   also re-opens the banner when clicked.

   Event: window 'glime:cookie-consent'  (detail.status)
   ========================================================= */
(function () {
  'use strict';
  if (window.GLIME_COOKIE_CONSENT) return;

  /* ---- Settings ------------------------------------------------
     vapidPublicKey     Web Push public (VAPID) key from the backend.
                        Leave empty until the backend is ready; the
                        banner, permission prompt and service worker
                        still work without it.
     subscribeEndpoint  URL that receives the push subscription (POST JSON).
                        Leave empty until the backend is ready.
  ---------------------------------------------------------------- */
  var CONFIG = {
    vapidPublicKey: '',
    subscribeEndpoint: '',
    serviceWorker: '/sw.js',
    privacyUrl: 'privacy.html'
  };

  var KEY = 'glime_cookie_consent';
  var VERSION = 1;
  var MAX_AGE = 60 * 60 * 24 * 365;
  var STYLE_ID = 'glimeCookieStyle';
  var banner = null;

  /* ---- Storage ------------------------------------------------ */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function cookieGet(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function cookieSet(name, value) {
    var c = name + '=' + encodeURIComponent(value) +
      '; max-age=' + MAX_AGE + '; path=/; SameSite=Lax';
    if (location.protocol === 'https:') c += '; Secure';
    document.cookie = c;
  }

  function getConsent() {
    var raw = lsGet(KEY);
    if (raw) {
      try {
        var o = JSON.parse(raw);
        if (o && o.v === VERSION && (o.status === 'accepted' || o.status === 'essential')) return o;
      } catch (e) {}
    }
    var c = cookieGet(KEY);
    if (c === 'accepted' || c === 'essential') return { v: VERSION, status: c, ts: 0 };
    return null;
  }

  function saveConsent(status) {
    lsSet(KEY, JSON.stringify({ v: VERSION, status: status, ts: Date.now() }));
    cookieSet(KEY, status);
    try {
      window.dispatchEvent(new CustomEvent('glime:cookie-consent', { detail: { status: status } }));
    } catch (e) {}
  }

  /* ---- Notifications ------------------------------------------ */
  function pushSupported() {
    return 'Notification' in window &&
      'serviceWorker' in navigator &&
      window.isSecureContext;
  }

  function b64ToU8(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function saveSubscription(sub) {
    if (!CONFIG.subscribeEndpoint || !sub) return;
    try {
      fetch(CONFIG.subscribeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          visitor_id: lsGet('glime_visitor_id'),
          page: location.pathname,
          user_agent: navigator.userAgent
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  function setupPush(welcome) {
    return navigator.serviceWorker
      .register(CONFIG.serviceWorker, { scope: '/' })
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) {
        var subP = Promise.resolve(null);
        if (reg.pushManager && CONFIG.vapidPublicKey) {
          subP = reg.pushManager.getSubscription().then(function (s) {
            return s || reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: b64ToU8(CONFIG.vapidPublicKey)
            });
          });
        }
        return subP.then(function (sub) {
          saveSubscription(sub);
          return reg;
        });
      })
      .then(function (reg) {
        if (welcome) {
          return reg.showNotification('Notifications are on', {
            body: 'You will now receive GLIME updates on this device.',
            tag: 'glime-welcome'
          });
        }
      })
      .catch(function () {});
  }

  /* ask = true only when called from the Accept click (user gesture) */
  function enableNotifications(ask) {
    if (!pushSupported()) return;
    var perm = Notification.permission;
    if (perm === 'granted') { setupPush(false); return; }
    if (perm === 'default' && ask) {
      var r;
      try { r = Notification.requestPermission(); } catch (e) { return; }
      Promise.resolve(r).then(function (p) {
        if (p === 'granted') setupPush(true);
      });
    }
  }

  /* ---- UI ----------------------------------------------------- */
  var CSS = [
    '.gck{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translate(-50%,24px);width:min(740px,calc(100% - 24px));z-index:2147482000;box-sizing:border-box;display:flex;align-items:center;gap:18px;padding:16px 18px;background:#101b29;color:#f4fbfd;border:1px solid rgba(184,222,234,.16);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:Manrope,Arial,sans-serif;opacity:0;transition:opacity .22s ease,transform .22s ease}',
    '.gck.in{opacity:1;transform:translate(-50%,0)}',
    '.gck-bar{align-self:stretch;width:4px;border-radius:99px;background:linear-gradient(180deg,#50f5a8,#52e8ff);flex:none}',
    '.gck-body{flex:1;min-width:0}',
    '.gck-t{font-size:.95rem;font-weight:800;letter-spacing:-.01em;margin-bottom:5px}',
    '.gck-m{color:#9cabb9;font-size:.8rem;line-height:1.55}',
    '.gck-m a{color:#52e8ff;text-decoration:underline}',
    '.gck-act{display:flex;gap:9px;flex:none}',
    '.gck-btn{border:1px solid rgba(184,222,234,.16);background:transparent;color:#f4fbfd;border-radius:11px;padding:10px 16px;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer;white-space:nowrap}',
    '.gck-btn:focus-visible{outline:2px solid #52e8ff;outline-offset:2px}',
    '.gck-btn.ok{background:linear-gradient(105deg,#50f5a8,#52e8ff);color:#031014;border:0}',
    '@media(max-width:620px){.gck{flex-direction:column;align-items:stretch;gap:12px;padding:16px 16px 14px}.gck-bar{display:none}.gck-act{flex-direction:column-reverse}.gck-btn{width:100%;padding:13px 16px}}',
    '@media(prefers-reduced-motion:reduce){.gck{transition:none}}'
  ].join('');

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function hide() {
    if (!banner) return;
    var b = banner;
    banner = null;
    b.classList.remove('in');
    setTimeout(function () {
      if (b.parentNode) b.parentNode.removeChild(b);
    }, 240);
  }

  function show() {
    if (banner || !document.body) return;
    ensureStyle();

    banner = el('div', 'gck');
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');

    banner.appendChild(el('div', 'gck-bar'));

    var body = el('div', 'gck-body');
    body.appendChild(el('div', 'gck-t', 'We use cookies'));
    var msg = el('div', 'gck-m');
    msg.appendChild(document.createTextNode(
      'GLIME uses cookies to keep the website working and to understand how it is used. ' +
      'If you accept, we will also ask your permission to send GLIME notifications to this device. '
    ));
    var link = el('a', null, 'Privacy Policy');
    link.href = CONFIG.privacyUrl;
    msg.appendChild(link);
    msg.appendChild(document.createTextNode('.'));
    body.appendChild(msg);
    banner.appendChild(body);

    var act = el('div', 'gck-act');
    var essential = el('button', 'gck-btn', 'Essential only');
    essential.type = 'button';
    var accept = el('button', 'gck-btn ok', 'Accept');
    accept.type = 'button';
    act.appendChild(essential);
    act.appendChild(accept);
    banner.appendChild(act);

    essential.addEventListener('click', function () {
      saveConsent('essential');
      hide();
    });

    accept.addEventListener('click', function () {
      saveConsent('accepted');
      /* Must run inside this click so the browser allows the permission prompt. */
      enableNotifications(true);
      hide();
    });

    document.body.appendChild(banner);
    requestAnimationFrame(function () {
      if (banner) banner.classList.add('in');
    });
  }

  /* ---- Public API --------------------------------------------- */
  window.GLIME_COOKIE_CONSENT = {
    get: getConsent,
    open: show
  };

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-glime-cookie-settings]') : null;
    if (!t) return;
    e.preventDefault();
    show();
  });

  function init() {
    var c = getConsent();
    if (!c) {
      setTimeout(show, 700);
    } else if (c.status === 'accepted') {
      /* Returning visitor who accepted: keep the notification setup fresh, never re-ask. */
      enableNotifications(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
