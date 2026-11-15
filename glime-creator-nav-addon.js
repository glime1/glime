/* =========================================================
   GLIME - Creator link in the app-shell sidebar
   ---------------------------------------------------------
   Adds "Creator" under Services (after Telegram / Calendar when those are on)
   in the shared sidebar ONLY when the GLIME team has approved this client as
   a creator. When the client is not approved, the link is not there at all.

   Unlike glime-telegram-nav-addon.js (which trusts a browser switch), approval
   comes from the backend:
   1. At once, from a small per-user display hint in localStorage
      glime_creator_ok_<auth user id>, so the link does not flicker.
      connector-creator-addon.js keeps this hint up to date.
   2. Then, once per page load, the real status is read from the backend
      (table creator_applications, the signed-in user's own row, read-only)
      and the hint is corrected. This also covers an approval made on another
      device, and an approval that was later withdrawn.
   If the check cannot run (offline, expired login, table missing) the hint is
   left as it is.

   The hint and this link are display only. creator.html and its data must
   enforce approval on the backend (RLS), because anyone can edit localStorage.
========================================================= */
(function () {
  'use strict';
  if (window.GlimeCreatorNav) return;

  var CFG = {
    SB_URL: 'https://ufoulgbiqgjriwapuopc.supabase.co',
    SB_KEY: 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA',
    TABLE: 'creator_applications',
    PAGE: 'creator.html'
  };

  var PREFIX = 'glime_creator_ok_';
  var ID = 'gasCreatorLink';
  var PATH = '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>';

  /* Saved Supabase login: user id, token and expiry (no network, no flicker). */
  function session() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          var v = JSON.parse(localStorage.getItem(k) || 'null');
          var s = v && (v.currentSession || v);
          var u = s && s.user;
          if (u && u.id) return { id: u.id, token: s.access_token || '', exp: Number(s.expires_at) || 0 };
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function userId() {
    var s = session();
    return s ? s.id : '';
  }

  function isOn() {
    var id = userId();
    try { return !!id && localStorage.getItem(PREFIX + id) === '1'; } catch (e) { return false; }
  }

  function setHint(id, on) {
    try {
      if (on) localStorage.setItem(PREFIX + id, '1');
      else localStorage.removeItem(PREFIX + id);
    } catch (e) { /* ignore */ }
  }

  /* Returns false only while the sidebar does not exist yet. */
  function sync() {
    if (!document.getElementById('gasSidebar')) return false;
    var existing = document.getElementById(ID);
    if (!isOn()) {
      if (existing) existing.remove();
      return true;
    }
    if (existing) return true;
    var anchor = document.getElementById('gasTelegramLink') ||
      document.getElementById('gasCalendarLink') ||
      document.querySelector('#gasSidebar a.gas-link[href="services.html"]');
    if (!anchor || !anchor.parentNode) return true;

    var a = document.createElement('a');
    a.className = 'gas-link';
    a.id = ID;
    a.href = CFG.PAGE;
    a.title = 'Creator';
    a.setAttribute('data-label', 'Creator');
    a.style.setProperty('--i', '7');
    if (/creator(\.html)?$/i.test(location.pathname)) a.setAttribute('aria-current', 'page');
    a.innerHTML =
      '<span class="gas-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">' +
      PATH + '</svg></span><span class="gas-label">Creator</span>';
    a.addEventListener('click', function () {
      if (window.GlimeAppShell && window.GlimeAppShell.close) window.GlimeAppShell.close();
    });
    anchor.parentNode.insertBefore(a, anchor.nextSibling);
    return true;
  }

  var verified = false;

  /* One read-only check of the signed-in user's own application row. */
  function verify() {
    if (verified) return;
    var s = session();
    if (!s || !s.token || typeof fetch !== 'function') return;
    if (s.exp && s.exp * 1000 < Date.now() + 10000) return; /* login token expired: keep the hint */
    verified = true;
    var url = CFG.SB_URL + '/rest/v1/' + CFG.TABLE +
      '?select=status&auth_user_id=eq.' + encodeURIComponent(s.id) + '&limit=1';
    fetch(url, {
      headers: { apikey: CFG.SB_KEY, Authorization: 'Bearer ' + s.token, Accept: 'application/json' }
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (rows) {
      if (!Array.isArray(rows)) return;
      var ok = !!(rows[0] && String(rows[0].status).toLowerCase() === 'approved');
      setHint(s.id, ok);
      sync();
    }).catch(function () { /* keep what is shown */ });
  }

  window.GlimeCreatorNav = { sync: sync };

  window.addEventListener('glime-creator-connector', sync);
  window.addEventListener('glime-telegram-connector', function () { setTimeout(sync, 0); });
  window.addEventListener('glime-calendar-connector', function () { setTimeout(sync, 0); });
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf(PREFIX) === 0) sync();
  });

  function boot() {
    verify();
    if (sync()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (sync() || tries > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
