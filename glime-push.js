/* =========================================================
   GLIME PHONE NOTIFICATIONS (web push)
   Loaded once on every logged-in page by glime-app-shell.js.
   Public API:
     GlimePush.enable()   -> Promise<{ ok, reason? }>
     GlimePush.disable()  -> Promise<{ ok }>
     GlimePush.status()   -> Promise<'unsupported'|'blocked'|'off'|'on'>
========================================================= */
(function () {
  'use strict';
  if (window.GlimePush) return;

  var PUSH_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co/functions/v1/glime-web-push';
  var API_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var AUTH_STORAGE_KEY = 'sb-ufoulgbiqgjriwapuopc-auth-token';
  var SW_URL = '/sw.js';
  var DISMISS_KEY = 'glime_push_prompt_dismissed';
  var DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
  var STYLE_ID = 'glimePushStyle';

  var publicKeyCache = null;
  var card = null;

  function supported() {
    return window.isSecureContext &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function b64ToU8(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function getClient() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) {
        return supabaseClient;
      }
    } catch (e) { /* not defined on this page */ }
    return window.supabaseClient && window.supabaseClient.auth ? window.supabaseClient : null;
  }

  async function getToken() {
    var client = getClient();
    if (client) {
      try {
        var r = await client.auth.getSession();
        var s = r && r.data && r.data.session;
        if (s && s.access_token) return s.access_token;
      } catch (e) { /* fall back to storage */ }
    }
    try {
      var raw = lsGet(AUTH_STORAGE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        var t = o && (o.access_token || (o.currentSession && o.currentSession.access_token));
        var exp = o && o.expires_at;
        if (t && (!exp || exp * 1000 > Date.now() + 30000)) return t;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  async function getPublicKey() {
    if (publicKeyCache) return publicKeyCache;
    var res = await fetch(PUSH_URL + '?action=public-key', {
      headers: { apikey: API_KEY },
      cache: 'no-store'
    });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok || !body.publicKey) throw new Error('Push key unavailable');
    publicKeyCache = String(body.publicKey);
    return publicKeyCache;
  }

  async function getRegistration() {
    await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    return navigator.serviceWorker.ready;
  }

  function sameKey(sub, keyBytes) {
    var cur = sub && sub.options && sub.options.applicationServerKey;
    if (!cur) return true;
    var a = new Uint8Array(cur);
    if (a.length !== keyBytes.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== keyBytes[i]) return false;
    return true;
  }

  async function ensureSubscription(reg) {
    var keyBytes = b64ToU8(await getPublicKey());
    var sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, keyBytes)) {
      try { await sub.unsubscribe(); } catch (e) { /* ignore */ }
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes
      });
    }
    return sub;
  }

  async function sync() {
    var token = await getToken();
    if (!token) return { ok: false, reason: 'signed-out' };

    var reg = await getRegistration();
    var sub = await ensureSubscription(reg);

    var res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: API_KEY
      },
      body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() })
    });
    if (!res.ok) return { ok: false, reason: 'server' };
    return { ok: true };
  }

  async function enable() {
    if (!supported()) return { ok: false, reason: 'unsupported' };
    if (Notification.permission === 'denied') return { ok: false, reason: 'blocked' };

    try {
      if (Notification.permission !== 'granted') {
        var p = await Notification.requestPermission();
        if (p !== 'granted') {
          return { ok: false, reason: p === 'denied' ? 'blocked' : 'dismissed' };
        }
      }
      return await sync();
    } catch (e) {
      console.warn('GLIME push enable failed:', e);
      return { ok: false, reason: 'error' };
    }
  }

  async function disable() {
    if (!supported()) return { ok: true };
    try {
      var reg = await navigator.serviceWorker.getRegistration('/');
      var sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        var token = await getToken();
        if (token) {
          await fetch(PUSH_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token,
              apikey: API_KEY
            },
            body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint })
          }).catch(function () {});
        }
        await sub.unsubscribe();
      }
    } catch (e) {
      console.warn('GLIME push disable failed:', e);
    }
    return { ok: true };
  }

  async function status() {
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission !== 'granted') return 'off';
    try {
      var reg = await navigator.serviceWorker.getRegistration('/');
      var sub = reg && await reg.pushManager.getSubscription();
      return sub ? 'on' : 'off';
    } catch (e) {
      return 'off';
    }
  }

  var CSS = [
    '.gpush{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translate(-50%,24px);width:min(460px,calc(100% - 24px));z-index:5500;box-sizing:border-box;padding:16px 16px 14px;background:#111827;color:#fff;border:1px solid rgba(0,240,255,.28);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.55);font-family:Poppins,Arial,sans-serif;opacity:0;transition:opacity .22s ease,transform .22s ease}',
    '.gpush.in{opacity:1;transform:translate(-50%,0)}',
    '.gpush-t{font-size:.92rem;font-weight:700;margin:0 0 4px}',
    '.gpush-m{color:#9ca3af;font-size:.78rem;line-height:1.55;margin:0}',
    '.gpush-act{display:flex;gap:9px;margin-top:13px}',
    '.gpush-btn{flex:1;border:1px solid rgba(255,255,255,.14);background:transparent;color:#fff;border-radius:10px;padding:10px 14px;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}',
    '.gpush-btn.ok{background:linear-gradient(135deg,#00ff88,#00f0ff);color:#061018;border:0}',
    '.gpush-btn:disabled{opacity:.6;cursor:default}',
    '.gpush-btn:focus-visible{outline:2px solid #00f0ff;outline-offset:2px}',
    '@media(prefers-reduced-motion:reduce){.gpush{transition:none}}'
  ].join('');

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function hideCard() {
    if (!card) return;
    var c = card;
    card = null;
    c.classList.remove('in');
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 240);
  }

  function showCard() {
    if (card || !document.body) return;
    ensureStyle();

    card = node('div', 'gpush');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Phone notifications');

    var title = node('p', 'gpush-t', 'Get GLIME notifications on your phone');
    var msg = node('p', 'gpush-m',
      'Receive messages from the GLIME team and new WhatsApp / Instagram customer messages ' +
      'as notifications, even when this website is closed.');

    var act = node('div', 'gpush-act');
    var later = node('button', 'gpush-btn', 'Not now');
    later.type = 'button';
    var on = node('button', 'gpush-btn ok', 'Turn on');
    on.type = 'button';
    act.appendChild(later);
    act.appendChild(on);

    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(act);

    later.addEventListener('click', function () {
      lsSet(DISMISS_KEY, String(Date.now()));
      hideCard();
    });

    on.addEventListener('click', function () {
      on.disabled = true;
      later.disabled = true;
      enable().then(function (r) {
        if (r.ok) {
          title.textContent = 'Notifications are on';
          msg.textContent = 'You will now get GLIME notifications on this device.';
          act.style.display = 'none';
          setTimeout(hideCard, 2600);
        } else if (r.reason === 'blocked') {
          title.textContent = 'Notifications are blocked';
          msg.textContent = 'Allow notifications for glime.online in your browser or phone site settings, then try again.';
          act.style.display = 'none';
          lsSet(DISMISS_KEY, String(Date.now()));
          setTimeout(hideCard, 6000);
        } else if (r.reason === 'dismissed') {
          lsSet(DISMISS_KEY, String(Date.now()));
          hideCard();
        } else {
          title.textContent = 'Could not turn on notifications';
          msg.textContent = 'Please try again in a moment.';
          on.disabled = false;
          later.disabled = false;
        }
      });
    });

    document.body.appendChild(card);
    requestAnimationFrame(function () { if (card) card.classList.add('in'); });
  }

  function recentlyDismissed() {
    var t = Number(lsGet(DISMISS_KEY) || 0);
    return t > 0 && Date.now() - t < DISMISS_MS;
  }

  async function start() {
    if (!supported()) return;

    var token = await getToken();
    if (!token) return;

    if (Notification.permission === 'granted') {
      sync().catch(function () {});
    } else if (Notification.permission === 'default' && !recentlyDismissed()) {
      showCard();
    }

    var client = getClient();
    if (client && client.auth && client.auth.onAuthStateChange) {
      client.auth.onAuthStateChange(function (event) {
        if (event !== 'SIGNED_OUT') return;
        navigator.serviceWorker.getRegistration('/').then(function (reg) {
          return reg && reg.pushManager.getSubscription();
        }).then(function (sub) {
          if (sub) return sub.unsubscribe();
        }).catch(function () {});
      });
    }
  }

  window.GlimePush = { enable: enable, disable: disable, status: status };

  function init() {
    setTimeout(function () { start().catch(function () {}); }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
