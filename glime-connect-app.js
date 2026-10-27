/* =========================================================
   GLIME connect helper (Android app / installed PWA)
   ---------------------------------------------------------
   Meta (WhatsApp) and Instagram login do not finish inside the
   installed GLIME app: the app window cannot receive the result
   of the Meta popup, so Meta shows "Sorry, something went wrong".
   In a normal Chrome tab the same flow works.

   What this file does
   1. In the installed app, tapping "Continue with Meta" (WhatsApp)
      or "Connect Instagram" opens this same page in Chrome
      (?from_app=1) instead of starting the login inside the app.
   2. In Chrome, with ?from_app=1, it opens the connect step for
      you (WhatsApp: the connect dialog; Instagram: the login).
   3. When you come back to the app, the page reloads once so the
      new connection status shows.
   4. It shows the result of the Instagram login (connected or the
      error) instead of ignoring ?instagram_connected / ?instagram_error.

   Outside the installed app nothing changes for the buttons.
   No login, token or payment logic lives here.
   ========================================================= */
(function () {
  'use strict';
  if (window.__glimeConnectApp) return;
  window.__glimeConnectApp = true;

  var KEY = 'glime_connect_handoff';
  var MAX_AGE = 30 * 60 * 1000;
  var qs = new URLSearchParams(location.search);
  var fromApp = qs.get('from_app') === '1';
  var igOk = qs.get('instagram_connected');
  var igErr = qs.get('instagram_error');
  var igUser = qs.get('instagram_username');

  function standalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return window.navigator.standalone === true;
  }

  function android() { return /Android/i.test(navigator.userAgent || ''); }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function whenBody(fn) {
    if (document.body) { fn(); return; }
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  function cleanUrl(names) {
    try {
      var u = new URL(location.href);
      names.forEach(function (n) { u.searchParams.delete(n); });
      history.replaceState({}, document.title, u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
  }

  var noticeEl = null;
  function notice(text, bad, ms) {
    whenBody(function () {
      if (noticeEl && noticeEl.parentNode) noticeEl.parentNode.removeChild(noticeEl);
      var n = document.createElement('div');
      n.setAttribute('role', 'status');
      n.style.cssText = 'position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:50%;' +
        'transform:translateX(-50%);width:min(520px,calc(100% - 24px));box-sizing:border-box;' +
        'z-index:2147483000;background:#101b29;color:#f4fbfd;padding:12px 16px;border-radius:12px;' +
        'border:1px solid ' + (bad ? 'rgba(255,100,114,.6)' : 'rgba(80,245,168,.55)') + ';' +
        'font:600 13px/1.5 Poppins,Arial,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.55)';
      n.textContent = text;
      document.body.appendChild(n);
      noticeEl = n;
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, ms || 9000);
    });
  }

  /* 4. result of the Instagram login ------------------------- */
  if (igOk || igErr) {
    if (igErr) {
      notice('Instagram connection failed: ' + igErr, true, 15000);
    } else {
      notice('Instagram connected' + (igUser ? ' as @' + igUser : '') + '.' +
        (!standalone() && android() ? ' You can go back to the GLIME app now.' : ''), false, 10000);
    }
    cleanUrl(['instagram_connected', 'instagram_username', 'instagram_error']);
  }

  /* 1. installed app: continue in Chrome ---------------------- */
  function handoff() {
    lsSet(KEY, String(Date.now()));
    var u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('from_app', '1');
    var target = 'intent://' + u.host + u.pathname + u.search +
      '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' +
      encodeURIComponent(u.href) + ';end';
    notice('Opening Chrome to finish connecting. Come back to the GLIME app when you are done.', false, 7000);
    setTimeout(function () { location.href = target; }, 250);
  }

  document.addEventListener('click', function (e) {
    /* fromApp inside the app means Chrome was not available and the
       fallback page opened here: let the normal flow run. */
    if (fromApp || !standalone() || !android()) return;
    var t = e.target && e.target.closest ? e.target.closest('#startConnect, #connect') : null;
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    handoff();
  }, true);

  /* 2. Chrome opened from the app: start the connect step ----- */
  if (fromApp) {
    cleanUrl(['from_app']);
    if (!standalone()) {
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if (!document.getElementById('boot')) {
          clearInterval(timer);
          var wa = document.getElementById('connectBtn');
          var ig = document.getElementById('connect');
          if (wa) {
            wa.click();
            notice('Tap "Continue with Meta" to finish. Then go back to the GLIME app.', false, 12000);
          } else if (ig) {
            notice('Opening Instagram login…', false, 6000);
            ig.click();
          }
          return;
        }
        if (tries > 80) clearInterval(timer);
      }, 250);
    }
  }

  /* 3. back in the app: refresh the connection status --------- */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !standalone()) return;
    var at = Number(lsGet(KEY));
    if (!at) return;
    lsDel(KEY);
    if (Date.now() - at < MAX_AGE) location.reload();
  });
})();
