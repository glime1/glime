/* =========================================================
   GLIME - Calendar link in the app-shell sidebar
   ---------------------------------------------------------
   Adds "Calendar" under Services in the shared sidebar ONLY when the
   client has turned on the Calendar connector (connector-calendar-addon.js).
   When it is off, the link is not there at all.
   Reads the same per-user flag: localStorage glime_cal_on_<auth user id>.
   Updates at once when the connector is switched (same tab or another tab).
========================================================= */
(function () {
  'use strict';
  if (window.GlimeCalendarNav) return;

  var PREFIX = 'glime_cal_on_';
  var ID = 'gasCalendarLink';
  var PATH =
    '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3M13 14h3M8 17.5h3"/>';

  /* Signed-in user id, read from the saved Supabase login (no network, no flicker). */
  function userId() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          var v = JSON.parse(localStorage.getItem(k) || 'null');
          var u = v && (v.user || (v.currentSession && v.currentSession.user));
          if (u && u.id) return u.id;
        }
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function isOn() {
    var id = userId();
    try { return !!id && localStorage.getItem(PREFIX + id) === '1'; } catch (e) { return false; }
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
    var anchor = document.querySelector('#gasSidebar a.gas-link[href="services.html"]');
    if (!anchor || !anchor.parentNode) return true;

    var a = document.createElement('a');
    a.className = 'gas-link';
    a.id = ID;
    a.href = 'calendar.html';
    a.title = 'Calendar';
    a.setAttribute('data-label', 'Calendar');
    a.style.setProperty('--i', '5');
    if (/calendar(\.html)?$/i.test(location.pathname)) a.setAttribute('aria-current', 'page');
    a.innerHTML =
      '<span class="gas-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">' +
      PATH + '</svg></span><span class="gas-label">Calendar</span>';
    a.addEventListener('click', function () {
      if (window.GlimeAppShell && window.GlimeAppShell.close) window.GlimeAppShell.close();
    });
    anchor.parentNode.insertBefore(a, anchor.nextSibling);
    return true;
  }

  window.GlimeCalendarNav = { sync: sync };

  window.addEventListener('glime-calendar-connector', sync);
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf(PREFIX) === 0) sync();
  });

  function boot() {
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
